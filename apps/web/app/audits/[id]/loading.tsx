import { Skeleton } from '@cleartoship/ui';

/** Doherty Threshold target — skeleton in <400ms, identical layout to real page. */
export default function Loading() {
  return (
    <section className="mx-auto flex w-full max-w-[1280px] flex-col gap-6 px-4 py-12 sm:px-6">
      <Skeleton size="h-9 w-64" />
      <Skeleton size="h-5 w-96" />
      <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
        <div className="flex flex-col gap-2">
          {Array.from({ length: 15 }).map((_, i) => (
            <Skeleton key={i} size="h-9 w-full" />
          ))}
        </div>
        <Skeleton size="h-[400px] w-full" rounded="lg" />
      </div>
    </section>
  );
}
