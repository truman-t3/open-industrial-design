import { describe, expect, it, vi } from 'vitest';
import {
  AIProviderError,
  CapabilityRouter,
  ProviderRegistry,
  type ProviderConfig,
} from '@open-industrial-design/ai-core';
import {
  OPENAI_COMPATIBLE_PROVIDER_TYPE,
  OpenAICompatibleProvider,
  type FetchClient,
  type FetchRequest,
} from './index';

const config: ProviderConfig = {
  id: 'provider-1',
  type: OPENAI_COMPATIBLE_PROVIDER_TYPE,
  name: 'Local OpenAI-compatible',
  baseUrl: 'https://api.example.test/v1/',
  model: 'test-model',
  rememberKey: false,
};

describe('OpenAI-compatible Provider', () => {
  it('aborts an in-flight HTTP request and removes the cancellation listener', async () => {
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    let receivedSignal: AbortSignal | undefined;
    const fetchClient: FetchClient = async (_url, request) => {
      receivedSignal = request.signal;
      return new Promise((_resolve, reject) => {
        request.signal!.addEventListener('abort', () => reject(new Error('aborted')));
        controller.abort();
      });
    };
    const adapter = new OpenAICompatibleProvider(fetchClient);
    await expect(
      adapter.execute(
        'image.generate',
        { prompt: 'Lamp', count: 1 },
        {
          config,
          credentials: { apiKey: 'not-a-real-key' },
          signal: controller.signal,
        },
      ),
    ).rejects.toBeInstanceOf(AIProviderError);
    expect(receivedSignal?.aborted).toBe(true);
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
    remove.mockRestore();
  });
  it('sends a real multipart mask, rejects unconfirmed support and never falls back on rejection', async () => {
    const requests: FetchRequest[] = [];
    const provider = new OpenAICompatibleProvider(async (_url, request) => {
      requests.push(request);
      return { ok: true, status: 200, json: async () => ({ data: [{ b64_json: 'AQI=' }] }) };
    });
    const request = {
      prompt: 'Change the handle',
      images: [
        { mimeType: 'image/png', data: new Uint8Array([1]) },
        { mimeType: 'image/jpeg', data: new Uint8Array([7, 8]) },
      ],
      mask: { mimeType: 'image/png', data: new Uint8Array([2, 3]) },
    };
    await expect(
      provider.execute('image.edit', request, {
        config,
        credentials: { apiKey: 'secret-test-key' },
      }),
    ).rejects.toMatchObject({ code: 'unsupported' });
    expect(requests).toHaveLength(0);
    await provider.execute('image.edit', request, {
      config: { ...config, supportsMask: true },
      credentials: { apiKey: 'secret-test-key' },
    });
    const mask = (requests[0]!.body as FormData).get('mask') as Blob;
    expect(mask.type).toBe('image/png');
    expect([...new Uint8Array(await mask.arrayBuffer())]).toEqual([2, 3]);
    const submitted = (requests[0]!.body as FormData).getAll('image[]') as Blob[];
    expect(submitted).toHaveLength(2);
    expect([...new Uint8Array(await submitted[0]!.arrayBuffer())]).toEqual([1]);
    expect([...new Uint8Array(await submitted[1]!.arrayBuffer())]).toEqual([7, 8]);
    await expect(
      provider.execute(
        'image.edit',
        { ...request, images: [{ mimeType: 'image/jpeg', data: new Uint8Array([1]) }] },
        {
          config: { ...config, supportsMask: true },
          credentials: { apiKey: 'secret-test-key' },
        },
      ),
    ).rejects.toMatchObject({ code: 'unsupported' });
    expect(requests).toHaveLength(1);
    let calls = 0;
    const rejecting = new OpenAICompatibleProvider(async () => {
      calls += 1;
      return {
        ok: false,
        status: 400,
        json: async () => ({ error: { message: 'secret-test-key' } }),
      };
    });
    await expect(
      rejecting.execute('image.edit', request, {
        config: { ...config, supportsMask: true },
        credentials: { apiKey: 'secret-test-key' },
      }),
    ).rejects.toMatchObject({
      code: 'unsupported',
      message: expect.stringContaining('masked editing'),
    });
    expect(calls).toBe(1);
  });
  it('routes text, vision, and image generation through OpenAI-compatible HTTP endpoints', async () => {
    const requests: Array<{ url: string; body?: string }> = [];
    const fetchClient: FetchClient = async (url, request) => {
      requests.push({ url, body: typeof request.body === 'string' ? request.body : undefined });
      if (url.endsWith('/images/generations')) {
        return { ok: true, status: 200, json: async () => ({ data: [{ b64_json: 'AQI=' }] }) };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: 'Analysis complete.' } }] }),
      };
    };
    const registry = new ProviderRegistry();
    registry.register(new OpenAICompatibleProvider(fetchClient));
    const router = new CapabilityRouter(registry);
    const context = { config, credentials: { apiKey: 'secret-test-key' } };

    await expect(
      router.execute('text.generate', { prompt: 'Describe the form.' }, context),
    ).resolves.toEqual({
      text: 'Analysis complete.',
    });
    await expect(
      router.execute(
        'vision.analyze',
        {
          prompt: 'Analyze the form.',
          image: { mimeType: 'image/png', data: new Uint8Array([1, 2]) },
        },
        context,
      ),
    ).resolves.toEqual({ text: 'Analysis complete.' });
    await expect(
      router.execute('image.generate', { prompt: 'A lamp', count: 1 }, context),
    ).resolves.toEqual({
      images: [{ mimeType: 'image/png', data: new Uint8Array([1, 2]) }],
    });

    expect(requests.map((request) => request.url)).toEqual([
      'https://api.example.test/v1/chat/completions',
      'https://api.example.test/v1/chat/completions',
      'https://api.example.test/v1/images/generations',
    ]);
    expect(JSON.stringify(requests)).not.toContain('secret-test-key');
  });

  it.each([1, 2, 5])(
    'sends all %s sources with their exact bytes as multipart image input',
    async (count) => {
      let received: FetchRequest | undefined;
      const provider = new OpenAICompatibleProvider(async (_url, request) => {
        received = request;
        return { ok: true, status: 200, json: async () => ({ data: [{ b64_json: 'AQI=' }] }) };
      });
      await provider.execute(
        'image.edit',
        {
          prompt: 'Preserve the form and use the reference finish',
          count: 2,
          images: Array.from({ length: count }, (_, index) => ({
            mimeType: index % 2 ? 'image/jpeg' : 'image/png',
            data: new Uint8Array([index + 1, 100 + index]),
          })),
        },
        { config, credentials: { apiKey: 'secret-test-key' } },
      );
      expect(received?.body).toBeInstanceOf(FormData);
      const submitted = (received?.body as FormData).getAll('image[]') as Blob[];
      expect(submitted).toHaveLength(count);
      for (const [index, image] of submitted.entries()) {
        expect(image.type).toBe(index % 2 ? 'image/jpeg' : 'image/png');
        expect([...new Uint8Array(await image.arrayBuffer())]).toEqual([index + 1, 100 + index]);
      }
      expect((received?.body as FormData).get('n')).toBe('2');
      expect(received?.headers['Content-Type']).toBeUndefined();
    },
  );

  it('does not fall back to text generation when multi-image editing is rejected', async () => {
    const requests: string[] = [];
    const provider = new OpenAICompatibleProvider(async (url) => {
      requests.push(url);
      return {
        ok: false,
        status: 400,
        json: async () => ({ error: { message: 'Bearer secret-test-key' } }),
      };
    });
    await expect(
      provider.execute(
        'image.edit',
        {
          prompt: 'Keep the product form',
          images: [
            { mimeType: 'image/png', data: new Uint8Array([1]) },
            { mimeType: 'image/png', data: new Uint8Array([2]) },
          ],
        },
        { config, credentials: { apiKey: 'secret-test-key' } },
      ),
    ).rejects.toMatchObject({
      code: 'unsupported',
      message: expect.stringContaining('multi-image editing'),
    });
    expect(requests).toEqual(['https://api.example.test/v1/images/edits']);
  });

  it('normalizes invalid API key and unsupported capability responses without exposing credentials', async () => {
    const unauthorized: FetchClient = async () => ({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: 'Incorrect API key: secret-test-key' } }),
    });
    const provider = new OpenAICompatibleProvider(unauthorized);
    await expect(
      provider.testConnection({ config, credentials: { apiKey: 'secret-test-key' } }),
    ).rejects.toMatchObject({
      code: 'unauthorized',
      message: 'The API key was rejected. Check the key and Provider base URL.',
    } satisfies Partial<AIProviderError>);
  });

  it('normalizes network failures without leaking Authorization values', async () => {
    const unavailable: FetchClient = async () => {
      throw new Error('network offline');
    };
    const provider = new OpenAICompatibleProvider(unavailable);
    await expect(
      provider.testConnection({ config, credentials: { apiKey: 'secret-test-key' } }),
    ).rejects.toMatchObject({
      code: 'network',
      message: expect.not.stringContaining('secret-test-key'),
    } satisfies Partial<AIProviderError>);
  });

  it('reports Provider timeouts with a safe actionable message', async () => {
    const delayed: FetchClient = async (_, request) =>
      new Promise((_, reject) => {
        request.signal?.addEventListener('abort', () => reject(new Error('request aborted')));
      });
    const provider = new OpenAICompatibleProvider(delayed, 1);
    await expect(
      provider.testConnection({ config, credentials: { apiKey: 'secret-test-key' } }),
    ).rejects.toMatchObject({
      code: 'timeout',
      message: 'The Provider request timed out.',
    } satisfies Partial<AIProviderError>);
  });
});
