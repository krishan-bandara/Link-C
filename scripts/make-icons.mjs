import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

// Emerald rounded square with a white chat bubble and a link-chain glyph. `pad` shrinks the glyph for maskable safe zone.
const svg = (radius, scale) => `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${radius}" fill="#10b981"/>
  <g transform="translate(256 256) scale(${scale}) translate(-256 -256)">
    <path d="M128 132h256a40 40 0 0 1 40 40v128a40 40 0 0 1-40 40H252l-72 60v-60h-52a40 40 0 0 1-40-40V172a40 40 0 0 1 40-40z" fill="#fff"/>
    <g fill="none" stroke="#10b981" stroke-width="22" stroke-linecap="round">
      <path d="M226 236h-14a30 30 0 0 0 0 60h14"/>
      <path d="M286 236h14a30 30 0 0 1 0 60h-14"/>
      <path d="M224 266h64"/>
    </g>
  </g>
</svg>`;

mkdirSync('public', { recursive: true });
const jobs = [
  ['icon-192.png', 192, svg(112, 1)],
  ['icon-512.png', 512, svg(112, 1)],
  ['icon-maskable-512.png', 512, svg(0, 0.78)],
  ['apple-touch-icon.png', 180, svg(0, 0.9)],
];
for (const [name, size, s] of jobs) {
  await sharp(Buffer.from(s)).resize(size, size).png().toFile(`public/${name}`);
  console.log('wrote', name);
}
