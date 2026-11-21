import Link from 'next/link';
import { Banner } from '@/components/ui';
import type { LegalDoc } from '@/content/legal';

/** Renders a policy document (audit B8). Static: no client JavaScript needed. */
export function LegalPage({ doc }: { doc: LegalDoc }) {
  return (
    <article className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-h1 font-semibold text-fg">{doc.title}</h1>
        <p className="text-caption text-fg-muted">Version {doc.version}</p>
        {doc.draft ? (
          <Banner variant="system">
            Draft for legal review. Not final, and not yet the agreement between you and RAISE.
          </Banner>
        ) : null}
        <p className="text-body text-fg">{doc.intro}</p>
      </header>
      {doc.sections.map((s) => (
        <section key={s.heading} className="flex flex-col gap-2">
          <h2 className="font-display text-h3 font-semibold text-fg">{s.heading}</h2>
          {s.paragraphs.map((p) => (
            <p key={p} className="text-body-sm text-fg">
              {p}
            </p>
          ))}
        </section>
      ))}
      <nav
        aria-label="Policies"
        className="flex flex-wrap gap-4 border-t border-line pt-4 text-body-sm"
      >
        <Link href="/terms" className="text-accent hover:underline">
          Terms of service
        </Link>
        <Link href="/privacy" className="text-accent hover:underline">
          Privacy policy
        </Link>
        <Link href="/community-rules" className="text-accent hover:underline">
          Community rules
        </Link>
      </nav>
    </article>
  );
}
