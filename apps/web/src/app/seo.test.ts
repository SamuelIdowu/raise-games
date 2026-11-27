import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import robots from './robots';
import sitemap from './sitemap';

/** Top-level route folders inside a route group, e.g. `(app)` → ['admin', 'home', ...]. */
function routesIn(group: string): string[] {
  const dir = fileURLToPath(new URL(`./${group}`, import.meta.url));
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('_') && !e.name.startsWith('['))
    .map((e) => `/${e.name}`);
}

const disallowed = () => {
  const rules = robots().rules;
  const rule = Array.isArray(rules) ? rules[0]! : rules;
  return ([] as string[]).concat(rule.disallow ?? []);
};
const blocks = (path: string) => disallowed().some((prefix) => path.startsWith(prefix));
const sitemapPaths = () => sitemap().map((e) => new URL(e.url).pathname.replace(/\/$/, ''));

describe('robots and sitemap (pre-deploy audit 2026-11-27)', () => {
  it('disallows every signed-in and onboarding route, including dynamic children', () => {
    const privateRoutes = [...routesIn('(app)'), ...routesIn('(onboarding)')];
    expect(privateRoutes.length).toBeGreaterThan(5);
    for (const route of privateRoutes) expect(blocks(route), route).toBe(true);
    expect(blocks('/profile/01a21d66-cc1d-70cf-beea-823e197e0386')).toBe(true);
    expect(blocks('/matches/01a21d66-cc1d-70cf-beea-823e197e0386')).toBe(true);
  });

  it('uses path prefixes, not bracketed route patterns that match nothing', () => {
    for (const prefix of disallowed()) expect(prefix).not.toMatch(/\[/);
  });

  it('lists only public marketing pages in the sitemap, none of them disallowed', () => {
    const marketing = new Set(['', ...routesIn('(marketing)')]);
    const paths = sitemapPaths();
    expect(paths).toContain('');
    for (const path of paths) {
      expect(marketing.has(path), `${path} is not a marketing page`).toBe(true);
      expect(path).not.toMatch(/\[/);
      expect(blocks(path || '/'), `${path} is in the sitemap but disallowed`).toBe(false);
    }
  });
});
