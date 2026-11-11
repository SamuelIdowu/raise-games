import type { Meta, StoryObj } from '@storybook/react-vite';
import { Skeleton, SkeletonCard, SkeletonText } from './skeleton';

function SkeletonGallery() {
  return (
    <div className="flex w-[420px] flex-col gap-4">
      <SkeletonCard />
      <Skeleton className="h-10 w-full" />
      <SkeletonText lines={3} />
      <div className="rounded-card border border-line bg-surface p-4">
        <div className="mb-3 flex items-center gap-3">
          <Skeleton className="size-8 rounded-[2px]" />
          <Skeleton className="h-4 w-1/3" />
        </div>
        <SkeletonText lines={2} />
      </div>
    </div>
  );
}

const meta = {
  title: 'Components/Skeleton',
  component: SkeletonGallery,
} satisfies Meta<typeof SkeletonGallery>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Gallery: Story = {};
