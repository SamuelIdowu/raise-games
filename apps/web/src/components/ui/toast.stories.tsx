import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './button';
import { useToast } from './toast';

function ToastDemo() {
  const { toast } = useToast();
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="secondary"
        onClick={() => toast({ title: 'Challenge accepted', description: 'Opponent joined.' })}
      >
        Status toast
      </Button>
      <Button
        variant="danger"
        onClick={() =>
          toast({
            title: 'Upload failed',
            description: 'Check your connection and try again.',
            variant: 'error',
          })
        }
      >
        Error toast
      </Button>
    </div>
  );
}

const meta = {
  title: 'Components/Toast',
  component: ToastDemo,
} satisfies Meta<typeof ToastDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};
