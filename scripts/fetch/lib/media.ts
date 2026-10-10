import { join } from 'node:path';
import sharp from 'sharp';
import { MEDIA_DIR, ensureDir, exists, sleep } from './store';

/**
 * Download a remote image once and store it as webp under public/media.
 * Platform CDN links (telesco.pe, tiktokcdn, cdninstagram) expire, so the site
 * only ever references the local copy. Returns the public path, or undefined
 * when the download failed.
 */
export async function saveImage(
  remote: string | undefined,
  name: string,
  opts: { maxWidth?: number; headers?: Record<string, string> } = {},
): Promise<{ src: string; width: number; height: number } | undefined> {
  if (!remote) return undefined;
  const rel = `${name}.webp`;
  const abs = join(MEDIA_DIR, rel);

  if (await exists(abs)) {
    const meta = await sharp(abs).metadata();
    return { src: `/media/${rel}`, width: meta.width ?? 0, height: meta.height ?? 0 };
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(remote, { headers: opts.headers });
      if (!res.ok) throw new Error(`${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      await ensureDir(abs);
      const info = await sharp(buf)
        .rotate()
        .resize({ width: opts.maxWidth ?? 800, withoutEnlargement: true })
        .webp({ quality: 72 })
        .toFile(abs);
      return { src: `/media/${rel}`, width: info.width, height: info.height };
    } catch {
      await sleep(800);
    }
  }
  return undefined;
}
