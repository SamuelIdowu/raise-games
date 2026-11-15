import { randomBytes } from 'node:crypto';
import sharp from 'sharp';

/** A fake "result screen": score text on coloured panels, shaped like a real screenshot. */
export async function fakeScreenshot(
  score = '3 - 1',
  width = 1600,
  height = 900,
  hue = '#1d3557',
): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="100%" height="100%" fill="${hue}"/>
    <rect x="${width * 0.1}" y="${height * 0.2}" width="${width * 0.8}" height="${height * 0.5}" fill="#e63946"/>
    <circle cx="${width * 0.2}" cy="${height * 0.8}" r="${height * 0.08}" fill="#f1faee"/>
    <text x="50%" y="48%" font-size="${height * 0.2}" text-anchor="middle" fill="#ffffff" font-family="sans-serif">${score}</text>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/** A visually unrelated image (different layout), for "genuinely different" pHash checks. */
export async function differentScreenshot(seed = 0): Promise<Buffer> {
  const x = 700 + (seed % 5) * 60;
  return sharp({ create: { width: 1600, height: 900, channels: 3, background: '#2a9d8f' } })
    .composite([
      {
        input: Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect x="${x}" y="50" width="600" height="800" fill="#264653"/><rect x="60" y="600" width="${500 + seed * 20}" height="250" fill="#e9c46a"/></svg>`,
        ),
      },
    ])
    .jpeg({ quality: 80 })
    .toBuffer();
}

/** A random abstract image: unique structure per call, so pHash never collides by accident. */
export async function randomImage(): Promise<Buffer> {
  const bytes = randomBytes(14 * 5);
  const rects = Array.from({ length: 14 }, (_, i) => {
    const b = (k: number) => bytes[i * 5 + k]!;
    const x = Math.floor((b(0) / 255) * 1400);
    const y = Math.floor((b(1) / 255) * 750);
    const w = 80 + Math.floor((b(2) / 255) * 500);
    const h = 60 + Math.floor((b(3) / 255) * 400);
    const c = ((b(4) << 16) | (b(2) << 8) | b(0)).toString(16).padStart(6, '0');
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#${c}"/>`;
  }).join('');
  return sharp(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect width="100%" height="100%" fill="#101010"/>${rects}</svg>`,
    ),
  )
    .jpeg({ quality: 80 })
    .toBuffer();
}
