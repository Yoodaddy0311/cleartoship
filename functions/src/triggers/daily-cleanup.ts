// Daily cleanup scheduler — two responsibilities:
//   1. Remove progressEvents older than 7 days (architecture §3.7).
//   2. Remove anonymous user docs idle > 30 days (Sprint 1 Item #15).
//
// Schedule: 03:00 Asia/Seoul, every day.
// Strategy: paginate in chunks of 500 (Firestore WriteBatch hard limit) until
// exhausted. Each iteration commits its own WriteBatch so a single transient
// failure doesn't roll back prior progress.
//
// Anonymous user identification (Item #15 option a): the web POST handler
// denormalizes `isAnonymous` and `lastSeenAt` onto `users/{uid}` via
// touchUserDoc, so we can query the cleanup window with a single composite
// filter instead of paginating Firebase Auth.
//
// Storage object lifecycle (clone tarballs, etc.) is handled via the bucket's
// lifecycle policy declared in Terraform — out of scope for this function.

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const PROGRESS_RETENTION_DAYS = 7;
const ANON_USER_IDLE_DAYS = 30;
const BATCH_SIZE = 500;
const REGION = process.env.CLOUD_TASKS_LOCATION ?? 'asia-northeast3';

export const dailyCleanup = onSchedule(
  {
    schedule: '0 3 * * *',
    timeZone: 'Asia/Seoul',
    region: REGION,
    memory: '256MiB',
    timeoutSeconds: 540,
  },
  async () => {
    const db = getFirestore();
    const progressDeleted = await deleteOldProgressEvents(db);
    const anonUsersDeleted = await deleteIdleAnonymousUsers(db);
    log('info', 'dailyCleanup finished', {
      progressEventsDeleted: progressDeleted,
      anonymousUsersDeleted: anonUsersDeleted,
    });
  },
);

async function deleteOldProgressEvents(
  db: FirebaseFirestore.Firestore,
): Promise<number> {
  const cutoffMs = Date.now() - PROGRESS_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const cutoff = Timestamp.fromMillis(cutoffMs);

  let totalDeleted = 0;
  let iteration = 0;
  while (true) {
    iteration += 1;
    const snap = await db
      .collectionGroup('events')
      .where('ts', '<', cutoff)
      .limit(BATCH_SIZE)
      .get();

    if (snap.empty) break;

    const batch = db.batch();
    for (const doc of snap.docs) batch.delete(doc.ref);
    await batch.commit();
    totalDeleted += snap.size;
    log('info', 'Deleted progressEvents chunk', {
      iteration,
      chunkSize: snap.size,
      totalDeleted,
    });

    if (snap.size < BATCH_SIZE) break;
  }
  return totalDeleted;
}

async function deleteIdleAnonymousUsers(
  db: FirebaseFirestore.Firestore,
): Promise<number> {
  const cutoffMs = Date.now() - ANON_USER_IDLE_DAYS * 24 * 60 * 60 * 1000;
  const cutoff = Timestamp.fromMillis(cutoffMs);

  let totalDeleted = 0;
  let iteration = 0;
  while (true) {
    iteration += 1;
    const snap = await db
      .collection('users')
      .where('isAnonymous', '==', true)
      .where('lastSeenAt', '<', cutoff)
      .limit(BATCH_SIZE)
      .get();

    if (snap.empty) break;

    const batch = db.batch();
    for (const doc of snap.docs) batch.delete(doc.ref);
    await batch.commit();
    totalDeleted += snap.size;
    log('info', 'Deleted idle anonymous users chunk', {
      iteration,
      chunkSize: snap.size,
      totalDeleted,
    });

    if (snap.size < BATCH_SIZE) break;
  }
  return totalDeleted;
}

function log(level: 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>) {
  process.stderr.write(
    JSON.stringify({
      level,
      component: 'functions.dailyCleanup',
      message,
      ...(meta ? { meta } : {}),
      ts: new Date().toISOString(),
    }) + '\n',
  );
}
