import { createHash } from 'node:crypto';
import sharp, { type Metadata, type OutputInfo } from 'sharp';

/**
 * Screenshot treatment (TA "Uploads", Design §6/§11). Pure functions over bytes
 * so the EXIF-strip and hashing guarantees are unit-testable without storage.
 */

export const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type AllowedMime = (typeof ALLOWED_MIME)[number];

/** Server hard cap. The client compresses to ~300 KB; this leaves room for PNG fallbacks. */
export const MAX_UPLOAD_BYTES = 1_048_576;
export const MAX_EDGE_PX = 1280;
export const THUMB_EDGE_PX = 320;
/** Decoded-pixel guard against decompression bombs (~40 MP). */
const MAX_INPUT_PIXELS = 40_000_000;

/** Identify the real format from magic bytes; the declared Content-Type is never trusted. */
export function sniffMime(buf: Buffer): AllowedMime | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (
    buf.length >= 8 &&
    buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png';
  }
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

export function sha256Hex(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

export interface ProcessedImage {
  mime: AllowedMime;
  /** EXIF/XMP/IPTC-free JPEG, longest edge ≤ 1280px, orientation baked in. */
  stored: Buffer;
  thumb: Buffer;
  width: number;
  height: number;
  sha256: string;
  storedSha256: string;
  phash: string;
}

export class InvalidImageError extends Error {}

export async function processProofImage(original: Buffer): Promise<ProcessedImage> {
  const mime = sniffMime(original);
  if (!mime) throw new InvalidImageError('unsupported_type');

  let meta: Metadata;
  try {
    meta = await sharp(original, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
  } catch {
    throw new InvalidImageError('undecodable');
  }
  if (!meta.width || !meta.height) throw new InvalidImageError('undecodable');
  if ((meta.pages ?? 1) > 1) throw new InvalidImageError('animated');

  const base = () =>
    sharp(original, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' })
      // Bake EXIF orientation into pixels before metadata is dropped.
      .autoOrient();

  let stored: Buffer;
  let info: OutputInfo;
  try {
    // sharp writes no metadata unless withMetadata/keepExif is called: EXIF, GPS,
    // XMP and IPTC are all dropped here.
    ({ data: stored, info } = await base()
      .resize({ width: MAX_EDGE_PX, height: MAX_EDGE_PX, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#000000' })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer({ resolveWithObject: true }));
  } catch {
    throw new InvalidImageError('undecodable');
  }

  const thumb = await sharp(stored)
    .resize({ width: THUMB_EDGE_PX, height: THUMB_EDGE_PX, fit: 'inside' })
    .webp({ quality: 70 })
    .toBuffer();

  return {
    mime,
    stored,
    thumb,
    width: info.width,
    height: info.height,
    sha256: sha256Hex(original),
    storedSha256: sha256Hex(stored),
    phash: await perceptualHash(stored),
  };
}

// ---------------------------------------------------------------------------
// Perceptual hash: classic 64-bit DCT pHash.
// 1. grayscale, resize to 32x32  2. 2-D DCT-II  3. keep the top-left 8x8 low
// frequencies minus the DC term  4. bit = coefficient > median.
// Robust to re-encoding, resizing and mild crops; a re-screenshot of the same
// result screen lands within a few bits.
// ---------------------------------------------------------------------------

const N = 32;
const COS: number[][] = Array.from({ length: N }, (_, k) =>
  Array.from({ length: N }, (_, n) => Math.cos(((2 * n + 1) * k * Math.PI) / (2 * N))),
);

export async function perceptualHash(image: Buffer): Promise<string> {
  const pixels = await sharp(image)
    .grayscale()
    .resize(N, N, { fit: 'fill', kernel: 'lanczos3' })
    .raw()
    .toBuffer();

  // Separable 2-D DCT, only the 8x8 low-frequency block is needed.
  const rows: number[][] = Array.from({ length: N }, (_, y) =>
    Array.from({ length: 8 }, (_, u) => {
      let sum = 0;
      for (let x = 0; x < N; x++) sum += pixels[y * N + x]! * COS[u]![x]!;
      return sum;
    }),
  );
  const coeffs: number[] = [];
  for (let v = 0; v < 8; v++) {
    for (let u = 0; u < 8; u++) {
      let sum = 0;
      for (let y = 0; y < N; y++) sum += rows[y]![u]! * COS[v]![y]!;
      coeffs.push(sum);
    }
  }

  const ac = coeffs.slice(1);
  const median = [...ac].sort((a, b) => a - b)[Math.floor(ac.length / 2)]!;
  let bits = 0n;
  for (let i = 0; i < 64; i++) {
    // Bit 0 (DC) is always 0; it carries overall brightness, not structure.
    if (i > 0 && coeffs[i]! > median) bits |= 1n << BigInt(63 - i);
  }
  return bits.toString(16).padStart(16, '0');
}

export function hammingDistance(a: string, b: string): number {
  let x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let count = 0;
  while (x) {
    count += Number(x & 1n);
    x >>= 1n;
  }
  return count;
}

/** pHash distance at or under which two screenshots are treated as the same image. */
export const PHASH_SIMILAR_THRESHOLD = 6;
