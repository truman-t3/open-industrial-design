// SPDX-License-Identifier: MPL-2.0
import type { AppLocale } from '@open-industrial-design/core';
import { MAX_MODEL_FILE_SIZE, validateModelFile } from './adapter';
import { loadModel } from './model-loader';

interface Resource {
  uri?: string;
}
interface GltfDocument {
  asset?: { version?: string };
  buffers?: Resource[];
  images?: Resource[];
}

function localPath(path: string): string {
  const parts: string[] = [];
  for (const part of path.replaceAll('\\', '/').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (!parts.length) throw new Error('Resource path leaves the selected folder.');
      parts.pop();
    } else parts.push(part);
  }
  return parts.join('/');
}

function mimeType(file: File) {
  if (file.type) return file.type;
  const extension = file.name.toLowerCase().split('.').at(-1);
  return (
    (
      {
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        webp: 'image/webp',
        ktx2: 'image/ktx2',
      } as Record<string, string>
    )[extension ?? ''] ?? 'application/octet-stream'
  );
}

async function embed(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return `data:${mimeType(file)};base64,${btoa(binary)}`;
}

/** Own every referenced byte before parsing. No external URLs are fetched during import. */
export async function bundleModelFiles(files: File[], locale: AppLocale = 'en') {
  const zh = locale === 'zh-CN';
  const fail = (en: string, chinese: string): never => {
    throw new Error(zh ? chinese : en);
  };
  const primary = files.filter((file) => /\.(glb|gltf)$/i.test(file.name));
  if (primary.length !== 1)
    fail(
      'Select one GLB or GLTF model together with its buffers and textures.',
      '请选择一个 GLB 或 GLTF 模型，并同时选择其缓冲与贴图文件。',
    );
  const file = primary[0]!;
  const validation = validateModelFile(file);
  if (files.reduce((sum, item) => sum + item.size, 0) > MAX_MODEL_FILE_SIZE)
    fail('The selected files exceed the 150 MB limit.', '所选文件总大小超过 150 MB 上限。');
  const bytes = await file.arrayBuffer();
  let document: GltfDocument;
  const chunks: { type: number; data: Uint8Array }[] = [];
  try {
    if (validation.format === 'glb') {
      const header = new DataView(bytes);
      if (
        bytes.byteLength < 20 ||
        header.getUint32(0, true) !== 0x46546c67 ||
        header.getUint32(4, true) !== 2 ||
        header.getUint32(8, true) !== bytes.byteLength
      )
        throw new Error('Invalid GLB header.');
      let offset = 12;
      while (offset < bytes.byteLength) {
        if (offset + 8 > bytes.byteLength) throw new Error('Truncated GLB chunk.');
        const length = header.getUint32(offset, true);
        const type = header.getUint32(offset + 4, true);
        if (length % 4 || offset + 8 + length > bytes.byteLength)
          throw new Error('Invalid GLB chunk length.');
        chunks.push({ type, data: new Uint8Array(bytes, offset + 8, length) });
        offset += 8 + length;
      }
      if (chunks[0]?.type !== 0x4e4f534a) throw new Error('Missing GLB JSON.');
      document = JSON.parse(new TextDecoder().decode(chunks[0].data));
    } else document = JSON.parse(new TextDecoder().decode(bytes));
    if (!document || document.asset?.version !== '2.0')
      throw new Error('Only glTF 2.0 is supported.');
    if (
      (document.buffers && !Array.isArray(document.buffers)) ||
      (document.images && !Array.isArray(document.images))
    )
      throw new Error('Invalid resources.');
  } catch {
    return fail(
      'The model is damaged or is not a glTF 2.0 file. Nothing was imported.',
      '模型已损坏或不是 glTF 2.0 文件，未导入任何内容。',
    );
  }
  const mainPath = localPath(file.webkitRelativePath || file.name);
  const directory = mainPath.slice(0, mainPath.lastIndexOf('/') + 1);
  const embedded = new Map<File, Promise<string>>();
  for (const resource of [...(document.buffers ?? []), ...(document.images ?? [])]) {
    if (!resource || typeof resource !== 'object')
      fail('Invalid model resource.', '模型资源记录无效。');
    const uri = resource.uri;
    if (uri === undefined) continue;
    if (typeof uri !== 'string') fail('Invalid model resource path.', '模型资源路径无效。');
    if (uri.startsWith('data:')) continue;
    if (/^[a-z][a-z\d+.-]*:|^\/\//i.test(uri))
      fail(
        `Remote resource is not imported: ${uri}. Use local companion files.`,
        `模型引用远程资源：${uri}。请改用本地配套文件。`,
      );
    let path: string;
    try {
      path = localPath(directory + decodeURIComponent(uri));
    } catch {
      return fail(`Invalid resource path: ${uri}`, `资源路径无效：${uri}`);
    }
    const exact = files.filter(
      (item) => item !== file && localPath(item.webkitRelativePath || item.name) === path,
    );
    const candidates = exact.length
      ? exact
      : files.filter((item) => item !== file && item.name === path.split('/').at(-1));
    if (candidates.length !== 1)
      fail(
        `Missing or ambiguous resource: ${uri}. Select the model and all companion files together.`,
        `缺少资源或存在同名冲突：${uri}。请同时选择模型及全部配套文件。`,
      );
    const companion = candidates[0]!;
    if (!embedded.has(companion)) embedded.set(companion, embed(companion));
    resource.uri = await embedded.get(companion)!;
  }
  let blob: Blob;
  if (validation.format === 'gltf')
    blob = new Blob([JSON.stringify(document)], { type: validation.mimeType });
  else {
    const json = new TextEncoder().encode(JSON.stringify(document));
    const padded = new Uint8Array(Math.ceil(json.length / 4) * 4).fill(32);
    padded.set(json);
    chunks[0] = { type: 0x4e4f534a, data: padded };
    const length = 12 + chunks.reduce((sum, chunk) => sum + 8 + chunk.data.length, 0);
    const result = new ArrayBuffer(length);
    const view = new DataView(result);
    view.setUint32(0, 0x46546c67, true);
    view.setUint32(4, 2, true);
    view.setUint32(8, length, true);
    let offset = 12;
    for (const chunk of chunks) {
      view.setUint32(offset, chunk.data.length, true);
      view.setUint32(offset + 4, chunk.type, true);
      new Uint8Array(result, offset + 8, chunk.data.length).set(chunk.data);
      offset += 8 + chunk.data.length;
    }
    blob = new Blob([result], { type: validation.mimeType });
  }
  if (blob.size > MAX_MODEL_FILE_SIZE)
    fail('The self-contained model exceeds the 150 MB limit.', '打包后的模型超过 150 MB 上限。');
  return { blob, name: file.name, ...validation };
}

export async function prepareModelImport(
  files: File[],
  decoderPath: string,
  signal: AbortSignal,
  locale: AppLocale = 'en',
) {
  signal.throwIfAborted();
  const prepared = await bundleModelFiles(files, locale);
  signal.throwIfAborted();
  const url = URL.createObjectURL(prepared.blob);
  const task = loadModel(url, decoderPath);
  const cancel = () => task.cancel();
  signal.addEventListener('abort', cancel, { once: true });
  try {
    await task.promise;
    signal.throwIfAborted();
    return prepared;
  } catch (error) {
    if (signal.aborted) throw error;
    throw new Error(
      locale === 'zh-CN'
        ? '模型解析失败，请检查几何、贴图或压缩格式；未写入工程。'
        : 'Could not parse the model. Check geometry, textures and compression. The project was not changed.',
      { cause: error },
    );
  } finally {
    signal.removeEventListener('abort', cancel);
    task.cancel();
    URL.revokeObjectURL(url);
  }
}
