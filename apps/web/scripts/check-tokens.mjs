/**
 * Token drift guard: app code must use semantic Tailwind utilities or the CSS
 * variables emitted from packages/tokens/tokens.json, never raw color literals.
 *
 * Generated files, Storybook fixtures and the avatar gradient (a computed hue,
 * not a design color) are excluded.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const srcRoot = resolve(here, '..', 'src');
const allowlist = new Set(['components/ui/avatar.tsx']);
const skip = /(tokens\.css|tokens\.generated\.ts|\.stories\.tsx?|\.test\.tsx?)$/;
const hex = /(?<![A-Za-z0-9_])#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/;
const colorFunction = /\b(?:rgb|hsl)a?\(/;

const files = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.(css|ts|tsx)$/.test(entry) && !skip.test(full)) files.push(full);
  }
};
walk(srcRoot);

const offences = [];
for (const file of files) {
  const rel = relative(srcRoot, file).replaceAll('\\', '/');
  if (allowlist.has(rel)) continue;
  const lines = readFileSync(file, 'utf-8').split('\n');
  lines.forEach((text, index) => {
    if (hex.test(text) || colorFunction.test(text)) {
      offences.push(`${rel}:${index + 1}  ${text.trim()}`);
    }
  });
}

if (offences.length > 0) {
  console.error('Raw color literals found in apps/web/src. Use token utilities instead:\n');
  for (const offence of offences) console.error(`  ${offence}`);
  console.error(
    '\nAllowed: semantic Tailwind classes (bg-surface, text-fg, border-line) or var(--token).',
  );
  process.exit(1);
}

console.log(`Token check passed (${files.length} files).`);
