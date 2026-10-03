import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { collectPublicImages, reviewPublicImages } from '../../scripts/release-assets.mjs';
import {
  readLiberationReplacement,
  replacedFont,
  sketchFontDirectory,
} from '../../scripts/liberation-font.mjs';

// Fixed, reviewed bytes only. Neither development nor production fetches a CDN.
export function localRuntimeAssets() {
  const root = new URL('../../', import.meta.url);
  const registry = JSON.parse(
    readFileSync(new URL('licenses/runtime-notice-evidence.json', root), 'utf8'),
  );
  const assets = new Map();
  const replacement = readLiberationReplacement(fileURLToPath(root));
  const add = (name, path, sha256) => {
    const bytes = readFileSync(path);
    if (createHash('sha256').update(bytes).digest('hex') !== sha256) {
      throw new Error(`Runtime asset integrity failed: ${fileURLToPath(path)}`);
    }
    assets.set(name, bytes);
  };
  const imageRegistry = JSON.parse(
    readFileSync(new URL('licenses/release-assets.json', root), 'utf8'),
  );
  const images = reviewPublicImages(
    collectPublicImages(fileURLToPath(new URL('brand/', root))),
    imageRegistry,
    { allowAbsentReferences: true },
  );
  for (const image of images.filter((image) => image.role !== 'reference-only')) {
    add(image.file, new URL(`brand/${image.file}`, root), image.sha256);
  }
  for (const font of registry.files) {
    if (!/^[\w-]+\/[\w.-]+\.woff2$/.test(font.file)) throw new Error('Invalid font path');
    if (font.file === replacedFont) {
      assets.set(`${sketchFontDirectory}/fonts/${font.file}`, replacement.bytes);
      continue;
    }
    add(
      `${sketchFontDirectory}/fonts/${font.file}`,
      new URL(`packages/ui/node_modules/@excalidraw/excalidraw/dist/prod/fonts/${font.file}`, root),
      font.sha256,
    );
  }
  assets.set(`${sketchFontDirectory}/fonts/Liberation/LICENSE.txt`, Buffer.from(replacement.text));
  for (const [file, hash] of Object.entries({
    'draco_decoder.js': '6604be0104930049a96f5b30e2c17928fb13daca25c1f088349730eb0c6db3c8',
    'draco_wasm_wrapper.js': 'b93f6384147828f857456c84845f4dbceada5b7a8455991109c853e236a1f018',
    'draco_decoder.wasm': '0103c8bff79532c2f1a496dd9ea0764ac692ed8585d9136596ef9f043873a61f',
    'LICENSE.txt': 'd3709b0fb4b8a94bbb1d02b8a2e484f258b0d9c5c5a01f940391f3fe662cd1a4',
  }))
    add(`runtime/draco/1.5.5/${file}`, new URL(`vendor/draco/1.5.5/${file}`, root), hash);
  return {
    name: 'local-runtime-assets',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const base = server.config.base;
        const path = (request.url ?? '').split('?')[0];
        const bytes = assets.get(path.startsWith(base) ? path.slice(base.length) : '');
        if (!bytes) return next();
        response.setHeader(
          'Content-Type',
          path.endsWith('.png')
            ? 'image/png'
            : path.endsWith('.wasm')
              ? 'application/wasm'
              : path.endsWith('.woff2')
                ? 'font/woff2'
                : path.endsWith('.js')
                  ? 'text/javascript'
                  : 'text/plain',
        );
        response.end(bytes);
      });
    },
    generateBundle() {
      for (const [fileName, source] of assets) this.emitFile({ type: 'asset', fileName, source });
    },
  };
}
