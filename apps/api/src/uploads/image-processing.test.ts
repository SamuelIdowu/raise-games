import { describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import {
  InvalidImageError,
  MAX_EDGE_PX,
  PHASH_SIMILAR_THRESHOLD,
  hammingDistance,
  perceptualHash,
  processProofImage,
  sha256Hex,
  sniffMime,
} from './image-processing';
import { differentScreenshot, fakeScreenshot } from '../test-fixtures/screenshot';

async function jpegWithExif(): Promise<Buffer> {
  return sharp(await fakeScreenshot())
    .withExif({
      IFD0: { Copyright: 'raise-test', Make: 'TestPhone', Model: 'X1' },
      IFD3: {
        GPSLatitudeRef: 'N',
        GPSLatitude: '6/1 27/1 1800/100',
        GPSLongitudeRef: 'E',
        GPSLongitude: '3/1 23/1 2400/100',
      },
    })
    .jpeg()
    .toBuffer();
}

// First sharp call loads libvips + fonts for SVG rendering; slow on cold Windows runners.
vi.setConfig({ testTimeout: 30_000 });

describe('sniffMime', () => {
  it('identifies formats by magic bytes, not by name', async () => {
    const png = await fakeScreenshot();
    expect(sniffMime(png)).toBe('image/png');
    expect(sniffMime(await sharp(png).jpeg().toBuffer())).toBe('image/jpeg');
    expect(sniffMime(await sharp(png).webp().toBuffer())).toBe('image/webp');
  });

  it('rejects non-images and lookalikes', async () => {
    expect(sniffMime(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    expect(sniffMime(Buffer.from('%PDF-1.7 fake'))).toBeNull();
    expect(
      sniffMime(
        await sharp(await fakeScreenshot())
          .gif()
          .toBuffer(),
      ),
    ).toBeNull();
    expect(sniffMime(Buffer.alloc(0))).toBeNull();
  });
});

describe('processProofImage', () => {
  it('strips EXIF including GPS (byte-level proof)', async () => {
    const input = await jpegWithExif();
    const inMeta = await sharp(input).metadata();
    expect(inMeta.exif).toBeDefined();
    expect(input.includes(Buffer.from('Exif\0\0'))).toBe(true);
    expect(input.includes(Buffer.from('TestPhone'))).toBe(true);

    const out = await processProofImage(input);
    const outMeta = await sharp(out.stored).metadata();
    expect(outMeta.exif).toBeUndefined();
    expect(outMeta.xmp).toBeUndefined();
    expect(outMeta.iptc).toBeUndefined();
    expect(out.stored.includes(Buffer.from('Exif\0\0'))).toBe(false);
    expect(out.stored.includes(Buffer.from('TestPhone'))).toBe(false);
    expect(out.stored.includes(Buffer.from('raise-test'))).toBe(false);
    expect((await sharp(out.thumb).metadata()).exif).toBeUndefined();
  });

  it('bakes EXIF orientation into pixels before dropping it', async () => {
    const rotated = await sharp(await fakeScreenshot('1 - 0', 800, 400))
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();
    const out = await processProofImage(rotated);
    expect(out.width).toBe(400);
    expect(out.height).toBe(800);
    expect((await sharp(out.stored).metadata()).orientation).toBeUndefined();
  });

  it('caps the longest edge at 1280px and makes a small thumbnail', async () => {
    const out = await processProofImage(await fakeScreenshot('2 - 2', 2400, 1080));
    expect(Math.max(out.width, out.height)).toBe(MAX_EDGE_PX);
    const thumbMeta = await sharp(out.thumb).metadata();
    expect(Math.max(thumbMeta.width!, thumbMeta.height!)).toBe(320);
  });

  it('rejects files that are not decodable images', async () => {
    await expect(processProofImage(Buffer.from('not an image'))).rejects.toBeInstanceOf(
      InvalidImageError,
    );
    const truncated = (
      await sharp(await fakeScreenshot())
        .jpeg()
        .toBuffer()
    ).subarray(0, 200);
    await expect(processProofImage(truncated)).rejects.toBeInstanceOf(InvalidImageError);
  });

  it('hashes deterministically', async () => {
    const input = await fakeScreenshot();
    const a = await processProofImage(input);
    const b = await processProofImage(input);
    expect(a.sha256).toBe(sha256Hex(input));
    expect(a.sha256).toBe(b.sha256);
    expect(a.phash).toBe(b.phash);
    expect(a.phash).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('perceptualHash', () => {
  it('matches a re-encoded, resized copy of the same screenshot (re-screenshot cheat)', async () => {
    const original = await fakeScreenshot('3 - 1');
    const recompressed = await sharp(original).resize(900).jpeg({ quality: 55 }).toBuffer();
    const d = hammingDistance(await perceptualHash(original), await perceptualHash(recompressed));
    expect(d).toBeLessThanOrEqual(PHASH_SIMILAR_THRESHOLD);
  });

  it('separates genuinely different screenshots', async () => {
    const a = await fakeScreenshot('3 - 1');
    const other = await differentScreenshot();
    const d = hammingDistance(await perceptualHash(a), await perceptualHash(other));
    expect(d).toBeGreaterThan(PHASH_SIMILAR_THRESHOLD);
  });

  it('computes hamming distance', () => {
    expect(hammingDistance('0000000000000000', '0000000000000000')).toBe(0);
    expect(hammingDistance('ffffffffffffffff', '0000000000000000')).toBe(64);
    expect(hammingDistance('8000000000000001', '0000000000000000')).toBe(2);
  });
});
