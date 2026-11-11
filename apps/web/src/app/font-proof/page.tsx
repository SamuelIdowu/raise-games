'use client';

import Link from 'next/link';

export default function FontProofPage() {
  return (
    <main className="mx-auto max-w-3xl p-6 space-y-10">
      <header>
        <h1 className="font-display text-display font-bold uppercase tracking-tight text-fg">
          Font proof — Chakra Petch
        </h1>
        <p className="mt-2 text-body-sm text-fg-muted">
          Verifies Latin-Extended glyphs (ẹ, ọ, ṣ), tabular numerals, and preload budget.
        </p>
      </header>

      <section className="space-y-4 rounded-card border border-line bg-raised p-6">
        <h2 className="font-display text-h2 font-semibold text-fg">
          Yoruba glyphs in display face
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-control border border-line bg-surface p-4 text-center">
            <code className="font-display text-body-sm text-fg-muted">ẹ</code>
            <p
              className="mt-2 font-display text-[48px] font-semibold text-fg"
              style={{ fontFamily: 'var(--font-chakra)' }}
            >
              ẹ
            </p>
            <p className="mt-1 text-caption text-fg-subtle">U+1EB9</p>
          </div>
          <div className="rounded-control border border-line bg-surface p-4 text-center">
            <code className="font-display text-body-sm text-fg-muted">ọ</code>
            <p
              className="mt-2 font-display text-[48px] font-semibold text-fg"
              style={{ fontFamily: 'var(--font-chakra)' }}
            >
              ọ
            </p>
            <p className="mt-1 text-caption text-fg-subtle">U+1ECD</p>
          </div>
          <div className="rounded-control border border-line bg-surface p-4 text-center">
            <code className="font-display text-body-sm text-fg-muted">ṣ</code>
            <p
              className="mt-2 font-display text-[48px] font-semibold text-fg"
              style={{ fontFamily: 'var(--font-chakra)' }}
            >
              ṣ
            </p>
            <p className="mt-1 text-caption text-fg-subtle">U+1E63</p>
          </div>
        </div>
        <p
          className="mt-4 font-display text-h3 font-semibold text-fg"
          style={{ fontFamily: 'var(--font-chakra)' }}
        >
          Lagos ẹbá ṣíṣẹ́ — Chakra Petch 500/600/700
        </p>
      </section>

      <section className="space-y-4 rounded-card border border-line bg-raised p-6">
        <h2 className="font-display text-h2 font-semibold text-fg">
          Tabular numerals at 12px & 14px
        </h2>
        <p className="text-body-sm text-fg-muted">
          If digits misalign at small sizes, fallback to mono face per doc decision.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-control border border-line bg-surface p-4">
            <code className="font-display text-body-sm text-fg-muted">12px tabular</code>
            <pre
              className="mt-2 font-mono text-[12px] tabular-nums text-fg"
              style={{ fontFamily: 'var(--font-chakra)' }}
            >
              {`₦ 1,234,567
₦    98,765
₦     1,234`}
            </pre>
          </div>
          <div className="rounded-control border border-line bg-surface p-4">
            <code className="font-display text-body-sm text-fg-muted">14px tabular</code>
            <pre
              className="mt-2 font-mono text-[14px] tabular-nums text-fg"
              style={{ fontFamily: 'var(--font-chakra)' }}
            >
              {`₦ 1,234,567
₦    98,765
₦     1,234`}
            </pre>
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-card border border-line bg-raised p-6">
        <h2 className="font-display text-h2 font-semibold text-fg">
          Weight samples (500 / 600 / 700)
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { weight: 500, label: 'Regular (500)' },
            { weight: 600, label: 'Semi-bold (600)' },
            { weight: 700, label: 'Bold (700)' },
          ].map(({ weight, label }) => (
            <div key={weight} className="rounded-control border border-line bg-surface p-4">
              <code className="font-display text-body-sm text-fg-muted">{label}</code>
              <p
                className="mt-2 font-display text-h3 text-fg"
                style={{ fontFamily: 'var(--font-chakra)', fontWeight: weight }}
              >
                Lagos ẹbá ṣíṣẹ́
              </p>
              <p
                className="mt-1 text-caption text-fg-subtle"
                style={{ fontFamily: 'var(--font-chakra)', fontWeight: weight }}
              >
                Quick brown fox jumps over the lazy dog 1234567890
              </p>
            </div>
          ))}
        </div>
      </section>

      <nav className="flex justify-center">
        <Link
          href="/design"
          className="inline-flex h-11 items-center justify-center rounded-control border border-transparent bg-accent px-4 font-display text-h3 font-semibold text-on-accent transition-colors duration-[var(--motion-micro)] hover:bg-accent-hover"
        >
          Back to design system
        </Link>
      </nav>
    </main>
  );
}
