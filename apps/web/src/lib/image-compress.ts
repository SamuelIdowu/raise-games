/**
 * Client-side screenshot compression (Design §11): longest edge ≤ 1280px and
 * about 300 KB or less. Re-encoding through a canvas also drops EXIF (the
 * server strips it again regardless).
 */
export const MAX_EDGE = 1280;
export const TARGET_BYTES = 300 * 1024;
const QUALITIES = [0.82, 0.72, 0.62, 0.52, 0.42];

export interface CompressedImage {
  blob: Blob;
  width: number;
  height: number;
}

export async function compressImage(file: Blob): Promise<CompressedImage> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    let scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    for (let attempt = 0; attempt < 3; attempt++) {
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('canvas unavailable');
      ctx.drawImage(bitmap, 0, 0, width, height);
      for (const quality of QUALITIES) {
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, 'image/jpeg', quality),
        );
        if (blob && blob.size <= TARGET_BYTES) return { blob, width, height };
        if (blob && quality === QUALITIES[QUALITIES.length - 1] && attempt === 2) {
          return { blob, width, height };
        }
      }
      scale *= 0.75;
    }
    throw new Error('could not compress image');
  } finally {
    bitmap.close();
  }
}
