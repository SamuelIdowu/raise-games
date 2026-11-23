import { SkeletonCard } from '@/components/ui';

export default function Loading() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 animate-pulse">
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard />
    </main>
  );
}
