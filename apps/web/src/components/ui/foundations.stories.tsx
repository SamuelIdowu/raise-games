import type { Meta, StoryObj } from '@storybook/react-vite';
import { Icon, type IconName } from './icons';

const swatches = [
  '--bg-0',
  '--bg-1',
  '--bg-2',
  '--bg-3',
  '--border',
  '--border-strong',
  '--text-1',
  '--text-2',
  '--text-3',
  '--accent',
  '--accent-hover',
  '--accent-press',
  '--win',
  '--loss',
  '--dispute',
];

function ColorGrid() {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {swatches.map((token) => (
        <div key={token} className="flex items-center gap-2">
          <span
            className="size-8 rounded-[2px] border border-line-strong"
            style={{ backgroundColor: `var(${token})` }}
          />
          <span className="text-caption text-fg-muted">{token}</span>
        </div>
      ))}
    </div>
  );
}

function TypeProof() {
  return (
    <div className="flex flex-col gap-3">
      <p className="font-display text-display font-bold text-fg">Display 32/36</p>
      <p className="font-display text-h1 font-semibold text-fg">Heading 1 24/28</p>
      <p className="font-display text-h2 font-semibold text-fg">Heading 2 20/24</p>
      <p className="font-display text-h3 font-semibold text-fg">Heading 3 16/20</p>
      <p className="text-body text-fg">Body 16/24 — verified 1v1 challenges with real stakes.</p>
      <p className="text-body-sm text-fg-muted">Body small 14/20 — secondary copy.</p>
      <p className="text-caption text-fg-subtle">Caption 12/16 — timestamps and metadata.</p>
      <p className="label-caps text-fg-muted">Label caps 12/16</p>
      <p className="font-display text-h2 font-semibold text-fg">Yorùbá: ẹ ọ ṣ Ẹ Ọ Ṣ</p>
      <p className="font-display text-caption text-fg-muted">12px: ẹ ọ ṣ Ẹ Ọ Ṣ — Ẹ̀kọ́ àti Ọ̀rẹ̀</p>
      <div className="grid grid-cols-10 gap-1 font-display text-caption text-fg tabular">
        {'0123456789'.split('').map((digit) => (
          <span key={digit} className="rounded-[2px] border border-line bg-raised py-1 text-center">
            {digit}
          </span>
        ))}
      </div>
    </div>
  );
}

const iconNames: IconName[] = [
  'circle',
  'check',
  'check-circle',
  'play',
  'clock',
  'alert-triangle',
  'ban',
  'hourglass',
  'flag',
  'undo',
  'info',
  'wifi-off',
  'x',
  'loader',
  'chevron-down',
  'shield',
  'copy',
  'plus',
];

function IconGrid() {
  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
      {iconNames.map((name) => (
        <div
          key={name}
          className="flex flex-col items-center gap-1 rounded-card border border-line bg-surface p-3 text-fg-muted"
        >
          <Icon name={name} size={24} />
          <span className="text-caption">{name}</span>
        </div>
      ))}
    </div>
  );
}

const meta = {
  title: 'Foundations/Tokens',
  component: ColorGrid,
} satisfies Meta<typeof ColorGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Colors: Story = {};

export const TypeScale: Story = { render: () => <TypeProof /> };

export const Icons: Story = { render: () => <IconGrid /> };
