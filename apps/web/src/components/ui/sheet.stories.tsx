import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Button } from './button';
import { Sheet } from './sheet';

function SheetDemo({ size }: { size?: 'sm' | 'lg' }) {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <Button onClick={() => setOpen(true)}>Open sheet</Button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Confirm result"
        size={size}
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" fullWidth onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button fullWidth onClick={() => setOpen(false)}>
              Confirm result
            </Button>
          </div>
        }
      >
        <p className="text-body text-fg">
          Your opponent submitted a 2–1 win. Confirming locks the result and updates both ratings.
        </p>
      </Sheet>
    </div>
  );
}

const meta = {
  title: 'Components/Sheet',
  component: SheetDemo,
} satisfies Meta<typeof SheetDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const MobileBottomSheet: Story = { args: { size: 'sm' } };

export const DesktopModal: Story = { args: { size: 'lg' } };
