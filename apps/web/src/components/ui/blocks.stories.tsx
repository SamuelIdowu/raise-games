import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './button';
import { Card } from './card';
import { PageHeader } from './page-header';
import { StatCard } from './stat-card';
import { Tabs, tabPanelProps } from './tabs';

const meta = {
  title: 'Components/Blocks primitives',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Header: Story = {
  render: () => (
    <PageHeader
      eyebrow="Your account"
      title="Profile"
      subtitle="ade_plays · Joined Nov 2026"
      action={<Button variant="secondary">Edit profile</Button>}
    />
  ),
};

export const Stats: Story = {
  render: () => (
    <div className="grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-3">
      <StatCard label="Rating" value={1180} delta="+12 vs last week" icon="star" />
      <StatCard label="Record" value="20-5-1" icon="crown" />
      <StatCard label="Streak" value="W3" delta="+3 vs last week" icon="flame" />
    </div>
  ),
};

export const Cards: Story = {
  render: () => (
    <div className="grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2">
      <Card>
        <p className="label-caps text-fg-subtle">Static card</p>
        <p className="mt-2 text-body-sm text-fg-muted">Gradient surface, hairline border.</p>
      </Card>
      <Card interactive>
        <p className="label-caps text-fg-subtle">Interactive card</p>
        <p className="mt-2 text-body-sm text-fg-muted">Hover lifts 4px.</p>
      </Card>
    </div>
  ),
};

function TabsDemo() {
  const [tab, setTab] = useState<'notifications' | 'messages' | 'preferences'>('notifications');
  return (
    <div className="max-w-xl">
      <Tabs
        idPrefix="demo"
        aria-label="Inbox"
        value={tab}
        onChange={setTab}
        items={[
          { key: 'notifications', label: 'Notifications', count: 3 },
          { key: 'messages', label: 'Messages' },
          { key: 'preferences', label: 'Preferences' },
        ]}
      />
      <div {...tabPanelProps('demo', tab)} className="pt-4 text-body-sm text-fg-muted">
        Panel: {tab}
      </div>
    </div>
  );
}

export const TabBar: Story = { render: () => <TabsDemo /> };
