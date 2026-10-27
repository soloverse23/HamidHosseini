// Render the site icons in public/ from scripts/dev/portrait.jpg (640×640).
//   node scripts/dev/favicons.mjs
// Tab icons are a tight round crop of the head, so the face still reads at
// 16px; home-screen icons are opaque squares that the OS masks itself.
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const src = 'scripts/dev/portrait.jpg';
const white = '#ffffff'; // the photo's own backdrop, so padding is seamless
const accent = '#1d4f91';

// Square regions of the source: the head alone, and head with shoulders.
const head = { left: 96, top: 8, width: 390, height: 390 };
const bust = { left: 40, top: 0, width: 520, height: 520 };

const crop = (region, size) =>
  sharp(src).extract(region).resize(size, size, { kernel: 'lanczos3' }).sharpen({ sigma: size < 64 ? 0.6 : 0.4 }).toBuffer();

// Round tab icon: photo in a circle with a thin accent ring, transparent corners.
async function round(size) {
  const ring = Math.max(1, Math.round(size / 24));
  const r = size / 2;
  const photo = await crop(head, size);
  const mask = Buffer.from(`<svg width="${size}" height="${size}"><circle cx="${r}" cy="${r}" r="${r}"/></svg>`);
  const border = Buffer.from(
    `<svg width="${size}" height="${size}"><circle cx="${r}" cy="${r}" r="${r - ring / 2}" fill="none" stroke="${accent}" stroke-width="${ring}"/></svg>`,
  );
  return sharp(photo)
    .ensureAlpha()
    .composite([{ input: mask, blend: 'dest-in' }, { input: border }])
    .png()
    .toBuffer();
}

// Opaque square; `pad` shrinks the photo into a white margin (maskable safe zone),
// sitting on the bottom edge so the robe runs off the icon rather than ending.
async function square(size, region, pad = 0) {
  const inner = Math.round(size * (1 - pad * 2));
  const photo = await crop(region, inner);
  return sharp({ create: { width: size, height: size, channels: 3, background: white } })
    .composite([{ input: photo, gravity: 'south' }])
    .png()
    .toBuffer();
}

// Multi-size .ico holding PNG frames (supported by every current browser).
function ico(frames) {
  const dir = Buffer.alloc(6 + frames.length * 16);
  dir.writeUInt16LE(1, 2);
  dir.writeUInt16LE(frames.length, 4);
  let offset = dir.length;
  frames.forEach(({ size, data }, i) => {
    const e = 6 + i * 16;
    dir.writeUInt8(size >= 256 ? 0 : size, e);
    dir.writeUInt8(size >= 256 ? 0 : size, e + 1);
    dir.writeUInt16LE(1, e + 4);
    dir.writeUInt16LE(32, e + 6);
    dir.writeUInt32LE(data.length, e + 8);
    dir.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([dir, ...frames.map((f) => f.data)]);
}

const out = {
  'favicon-96x96.png': await round(96),
  'apple-touch-icon.png': await square(180, head),
  'icon-192.png': await square(192, head),
  'icon-512.png': await square(512, bust),
  'icon-maskable-512.png': await square(512, head, 0.1),
};
out['favicon.ico'] = ico(await Promise.all([16, 32, 48].map(async (size) => ({ size, data: await round(size) }))));

for (const [name, data] of Object.entries(out)) writeFileSync(`public/${name}`, data);
console.log(Object.keys(out).map((n) => `public/${n}`).join('\n'));
