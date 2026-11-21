import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const index = new URL('../web/index.html', import.meta.url);
const publicAssets = new URL('../web/public/', import.meta.url);

function pngSize(path: string): [number, number] {
  const png = readFileSync(new URL(path, publicAssets));
  expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  return [png.readUInt32BE(16), png.readUInt32BE(20)];
}

test('the Endless Home Screen app links a standalone manifest with correctly sized PNG icons', () => {
  const html = readFileSync(index, 'utf8');
  expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest"');
  expect(html).toContain('<link rel="apple-touch-icon" href="/icons/endless-touch.png"');

  const manifest = JSON.parse(readFileSync(new URL('manifest.webmanifest', publicAssets), 'utf8'));
  expect(manifest).toMatchObject({ name: 'Endless', id: '/', start_url: '/', scope: '/', display: 'standalone' });
  expect(manifest.icons).toEqual([
    { src: '/icons/endless-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/icons/endless-512.png', sizes: '512x512', type: 'image/png' },
  ]);
  expect(pngSize('icons/endless-touch.png')).toEqual([180, 180]);
  expect(pngSize('icons/endless-192.png')).toEqual([192, 192]);
  expect(pngSize('icons/endless-512.png')).toEqual([512, 512]);
});
