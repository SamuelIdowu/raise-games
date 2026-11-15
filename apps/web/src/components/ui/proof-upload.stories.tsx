import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ProofUploadState } from '@/lib/use-proof-upload';
import { resultCopy } from '@/lib/copy/results';
import { ProofUpload } from './proof-upload';

// Inline SVG stand-in for a picked screenshot (no network in stories).
const PREVIEW =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90"><rect width="160" height="90" fill="#1d3557"/><text x="80" y="55" font-size="28" text-anchor="middle" fill="#fff">3 - 1</text></svg>',
  );

function Demo({ state, error }: { state: ProofUploadState; error?: string }) {
  return (
    <div className="max-w-md">
      <ProofUpload
        label={resultCopy.screenshot}
        help={resultCopy.screenshotHelp}
        state={state}
        copy={resultCopy.upload}
        error={error}
        onPick={() => undefined}
        onRetry={() => undefined}
        onRemove={() => undefined}
      />
    </div>
  );
}

const meta: Meta<typeof Demo> = {
  title: 'Components/Proof upload',
  component: Demo,
  parameters: {
    docs: {
      description: {
        component: 'Design §8 states: uploading, offline (queued), failed (retry), ready.',
      },
    },
  },
};
export default meta;
type Story = StoryObj<typeof Demo>;

export const Empty: Story = { args: { state: { status: 'idle' } } };
export const Required: Story = {
  args: { state: { status: 'idle' }, error: resultCopy.needScreenshot },
};
export const Uploading: Story = {
  args: { state: { status: 'uploading', previewUrl: PREVIEW, progress: 64 } },
};
export const Offline: Story = { args: { state: { status: 'offline', previewUrl: PREVIEW } } };
export const Failed: Story = {
  args: { state: { status: 'failed', previewUrl: PREVIEW, message: resultCopy.upload.failed } },
};
export const Ready: Story = {
  args: { state: { status: 'ready', previewUrl: PREVIEW, uploadId: 'demo', sizeKb: 214 } },
};
