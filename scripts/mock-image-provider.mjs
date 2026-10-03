// Local QA fixture only. Reuses repository demo images; never calls an external model.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const origin = 'http://127.0.0.1:5174';
const port = 5181;
const delayMs = Math.min(10000, Math.max(0, Number(process.env.OID_QA_DELAY_MS) || 0));
const images = await Promise.all(
  ['portable-lamp-variant.png', 'portable-lamp-cmf-blue.png'].map((name) =>
    readFile(new URL(`../brand/demo/${name}`, import.meta.url)).then((bytes) =>
      bytes.toString('base64'),
    ),
  ),
);

function json(response, status, value) {
  response.writeHead(status, {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Content-Type': 'application/json',
  });
  response.end(JSON.stringify(value));
}

createServer(async (request, response) => {
  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    });
    response.end();
    return;
  }
  if (request.url === '/v1/models' && request.method === 'GET') {
    json(response, 200, { data: [{ id: 'local-fixture' }] });
    return;
  }
  if (request.url !== '/v1/images/edits' || request.method !== 'POST') {
    json(response, 404, { error: 'Fixture supports image editing only.' });
    return;
  }
  try {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const formRequest = new Request('http://127.0.0.1/', {
      method: 'POST',
      headers: { 'Content-Type': request.headers['content-type'] ?? '' },
      body: Buffer.concat(chunks),
    });
    const form = await formRequest.formData();
    const count = Math.max(1, Math.min(Number(form.get('n')) || 1, 4));
    const inputImages = form.getAll('image[]');
    if (!inputImages.length || !String(form.get('prompt') ?? '').trim()) {
      json(response, 400, { error: 'Missing image or prompt.' });
      return;
    }
    const hashes = await Promise.all(
      inputImages.map(async (file) =>
        createHash('sha256')
          .update(Buffer.from(await file.arrayBuffer()))
          .digest('hex')
          .slice(0, 12),
      ),
    );
    process.stdout.write(
      `Fixture edit: ${inputImages.length} image(s), ${count} result(s), input SHA-256 ${hashes.join(', ')}\n`,
    );
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
    if (response.destroyed) {
      process.stdout.write('Fixture response connection closed before completion.\n');
      return;
    }
    json(response, 200, {
      data: Array.from({ length: count }, (_, index) => ({
        b64_json: images[index % images.length],
      })),
    });
  } catch {
    json(response, 400, { error: 'Invalid local fixture request.' });
  }
}).listen(port, '127.0.0.1', () => {
  process.stdout.write(`Local image fixture ready at http://127.0.0.1:${port}/v1\n`);
});
