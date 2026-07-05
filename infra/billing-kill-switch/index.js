// Billing kill switch (2026-07-05 free-tier decision).
//
// Subscribed to the `billing-kill-switch` Pub/Sub topic, which receives
// budget notifications for the ENTIRE billing account (all projects).
// When actual cost reaches the budget amount (KRW 5,000), this function
// unlinks the billing account from every linked project — Cloud Run,
// Firestore, etc. all shut down and no further spend is possible.
//
// Re-enabling is manual: console → Billing → Account management →
// re-link each project, then redeploy (see README.md in this directory).
//
// Budget messages fire on EVERY cost recalculation (several per day),
// not just on threshold crossings — the costAmount check below is the
// actual gate. Cost data lags real usage by a few hours, so total spend
// can slightly exceed the threshold before shutdown completes.
const functions = require('@google-cloud/functions-framework');
const {CloudBillingClient} = require('@google-cloud/billing');

const billing = new CloudBillingClient();
const BILLING_ACCOUNT = process.env.BILLING_ACCOUNT; // billingAccounts/XXXXXX
const ARMED = process.env.KILL_SWITCH_ARMED === '1';

functions.cloudEvent('stopBilling', async (cloudEvent) => {
  const data = JSON.parse(
    Buffer.from(cloudEvent.data.message.data, 'base64').toString()
  );
  const {costAmount, budgetAmount} = data;

  if (costAmount < budgetAmount) {
    console.log(`OK: cost ${costAmount} < budget ${budgetAmount} — no action`);
    return;
  }

  console.warn(`BUDGET EXCEEDED: cost ${costAmount} >= budget ${budgetAmount}`);

  const [projects] = await billing.listProjectBillingInfo({
    name: BILLING_ACCOUNT,
  });
  const linked = projects.filter((p) => p.billingEnabled);

  if (!ARMED) {
    console.warn(
      `DRY RUN (KILL_SWITCH_ARMED!=1): would unlink billing from: ` +
        linked.map((p) => p.projectId).join(', ')
    );
    return;
  }

  for (const p of linked) {
    try {
      await billing.updateProjectBillingInfo({
        name: `projects/${p.projectId}`,
        projectBillingInfo: {billingAccountName: ''},
      });
      console.warn(`BILLING DISABLED: ${p.projectId}`);
    } catch (err) {
      // Keep going — one failed unlink must not leave the rest billing.
      console.error(`FAILED to disable billing for ${p.projectId}:`, err);
    }
  }
});
