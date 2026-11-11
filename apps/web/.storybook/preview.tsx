import type { Preview } from '@storybook/react-vite';
import { useEffect, type ReactNode } from 'react';
import { ToastProvider } from '../src/components/ui';
import '../src/app/globals.css';

function Frame({ theme, children }: { theme: 'dark' | 'light'; children: ReactNode }) {
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return <div className="min-h-screen bg-bg p-6 text-fg">{children}</div>;
}

const preview: Preview = {
  globalTypes: {
    theme: {
      description: 'Token theme',
      toolbar: {
        title: 'Theme',
        icon: 'circlehollow',
        items: [
          { value: 'dark', title: 'Dark' },
          { value: 'light', title: 'Light' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: {
    theme: 'dark',
  },
  decorators: [
    (Story, { globals }) => (
      <Frame theme={globals.theme === 'light' ? 'light' : 'dark'}>
        <ToastProvider>
          <Story />
        </ToastProvider>
      </Frame>
    ),
  ],
  parameters: {
    layout: 'padded',
    backgrounds: { disable: true },
    viewport: {
      options: {
        mobile360: { name: 'Mobile 360', styles: { width: '360px', height: '800px' } },
        desktop1024: { name: 'Desktop 1024', styles: { width: '1024px', height: '900px' } },
      },
    },
    a11y: {
      context: 'body',
      manual: true,
    },
  },
};

export default preview;
