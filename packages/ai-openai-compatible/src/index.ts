import {
  AIProviderError,
  type AICapability,
  type AICapabilityRequests,
  type AICapabilityResults,
  type AIProvider,
  type ImageGenerateRequest,
  type ImageEditRequest,
  type ProviderConnectionResult,
  type ProviderImageInput,
  type ProviderRequestContext,
  type TextGenerateRequest,
  type VisionAnalyzeRequest,
} from '@open-industrial-design/ai-core';

export const OPENAI_COMPATIBLE_PROVIDER_TYPE = 'openai-compatible';
export const OPENAI_COMPATIBLE_DEFAULT_BASE_URL = 'https://api.openai.com/v1';
export const OPENAI_COMPATIBLE_DEFAULT_MODEL = 'gpt-4.1-mini';

export interface FetchResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

export interface FetchRequest {
  method: string;
  headers: Record<string, string>;
  body?: BodyInit;
  signal?: AbortSignal;
}

export type FetchClient = (url: string, request: FetchRequest) => Promise<FetchResponse>;

function defaultFetch(url: string, request: FetchRequest) {
  return fetch(url, request);
}

function normalizeBaseUrl(baseUrl?: string) {
  const value = (baseUrl || OPENAI_COMPATIBLE_DEFAULT_BASE_URL).trim().replace(/\/+$/, '');
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error();
  } catch {
    throw new AIProviderError('invalid_response', 'Base URL must be a valid HTTP(S) URL.');
  }
  return value;
}

function getApiKey(context: ProviderRequestContext) {
  const apiKey = context.credentials?.apiKey.trim();
  if (!apiKey)
    throw new AIProviderError('unauthorized', 'Add an API key before using this Provider.');
  return apiKey;
}

function modelFor(context: ProviderRequestContext) {
  return context.config.model?.trim() || OPENAI_COMPATIBLE_DEFAULT_MODEL;
}

function toBase64(data: Uint8Array) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < data.length; index += chunkSize) {
    binary += String.fromCharCode(...data.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function imageUrl(image: ProviderImageInput) {
  return `data:${image.mimeType};base64,${toBase64(image.data)}`;
}

function errorCodeForStatus(status: number) {
  if (status === 401 || status === 403) return 'unauthorized' as const;
  if (status === 429) return 'rate_limit' as const;
  if (status === 404 || status === 405 || status === 501) return 'unsupported' as const;
  return 'invalid_response' as const;
}

async function errorFromResponse(response: FetchResponse) {
  const code = errorCodeForStatus(response.status);
  const fallback =
    code === 'unauthorized'
      ? 'The API key was rejected. Check the key and Provider base URL.'
      : code === 'rate_limit'
        ? 'The Provider rate limit was reached. Try again later.'
        : code === 'unsupported'
          ? 'This Provider or model does not support the requested capability.'
          : 'The Provider returned an invalid request or response.';
  // Provider error payloads are untrusted and may echo request credentials or headers.
  // Only expose a local, normalized message to the UI and action record.
  throw new AIProviderError(code, fallback, OPENAI_COMPATIBLE_PROVIDER_TYPE);
}

function getChatText(payload: unknown) {
  if (
    !payload ||
    typeof payload !== 'object' ||
    !('choices' in payload) ||
    !Array.isArray(payload.choices)
  ) {
    throw new AIProviderError(
      'invalid_response',
      'Provider response did not contain chat choices.',
    );
  }
  const content = payload.choices[0]?.message?.content;
  if (typeof content === 'string' && content.trim()) return content;
  if (Array.isArray(content)) {
    const text = content
      .filter((part): part is { text: string } => typeof part?.text === 'string')
      .map((part) => part.text)
      .join('\n');
    if (text.trim()) return text;
  }
  throw new AIProviderError('invalid_response', 'Provider response did not contain text content.');
}

export class OpenAICompatibleProvider implements AIProvider {
  readonly descriptor = {
    type: OPENAI_COMPATIBLE_PROVIDER_TYPE,
    name: 'OpenAI-compatible',
    capabilities: ['text.generate', 'vision.analyze', 'image.generate', 'image.edit'] as const,
  };

  constructor(
    private readonly fetchClient: FetchClient = defaultFetch,
    private readonly timeoutMs = 20_000,
  ) {}

  async testConnection(context: ProviderRequestContext): Promise<ProviderConnectionResult> {
    const response = await this.request('/models', { method: 'GET' }, context);
    if (!response.ok) await errorFromResponse(response);
    return { ok: true, message: 'Connection verified.' };
  }

  async execute<C extends AICapability>(
    capability: C,
    request: AICapabilityRequests[C],
    context: ProviderRequestContext,
  ): Promise<AICapabilityResults[C]> {
    if (capability === 'text.generate')
      return (await this.generateText(
        request as TextGenerateRequest,
        context,
      )) as AICapabilityResults[C];
    if (capability === 'vision.analyze')
      return (await this.analyzeVision(
        request as VisionAnalyzeRequest,
        context,
      )) as AICapabilityResults[C];
    if (capability === 'image.generate')
      return (await this.generateImage(
        request as ImageGenerateRequest,
        context,
      )) as AICapabilityResults[C];
    if (capability === 'image.edit')
      return (await this.editImage(request as ImageEditRequest, context)) as AICapabilityResults[C];
    throw new AIProviderError(
      'unsupported',
      `Unsupported OpenAI-compatible capability: ${capability}`,
    );
  }

  private async generateText(request: TextGenerateRequest, context: ProviderRequestContext) {
    const messages = [
      ...(request.system ? [{ role: 'system', content: request.system }] : []),
      { role: 'user', content: request.prompt },
    ];
    const response = await this.request(
      '/chat/completions',
      {
        method: 'POST',
        body: JSON.stringify({
          model: modelFor(context),
          messages,
          temperature: request.temperature,
        }),
      },
      context,
    );
    if (!response.ok) await errorFromResponse(response);
    return { text: getChatText(await response.json()) };
  }

  private async analyzeVision(request: VisionAnalyzeRequest, context: ProviderRequestContext) {
    const response = await this.request(
      '/chat/completions',
      {
        method: 'POST',
        body: JSON.stringify({
          model: modelFor(context),
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: request.prompt },
                { type: 'image_url', image_url: { url: imageUrl(request.image) } },
              ],
            },
          ],
        }),
      },
      context,
    );
    if (!response.ok) await errorFromResponse(response);
    return { text: getChatText(await response.json()) };
  }

  private async generateImage(request: ImageGenerateRequest, context: ProviderRequestContext) {
    const response = await this.request(
      '/images/generations',
      {
        method: 'POST',
        body: JSON.stringify({
          model: modelFor(context),
          prompt: request.prompt,
          n: Math.max(1, Math.min(request.count ?? 1, 4)),
          response_format: 'b64_json',
        }),
      },
      context,
    );
    if (!response.ok) await errorFromResponse(response);
    return this.parseImages(await response.json());
  }

  private async editImage(request: ImageEditRequest, context: ProviderRequestContext) {
    if (request.mask && context.config.supportsMask !== true)
      throw new AIProviderError(
        'unsupported',
        'Confirm mask editing support in Provider settings before using a selection.',
      );
    if (request.mask && request.mask.mimeType !== 'image/png')
      throw new AIProviderError(
        'unsupported',
        'The edit mask must be a PNG with an alpha channel.',
      );
    if (request.mask && request.images[0]?.mimeType !== 'image/png')
      throw new AIProviderError('unsupported', 'Masked editing requires a PNG main image.');
    if (request.images.length < 1 || request.images.length > 5)
      throw new AIProviderError(
        'invalid_response',
        'Connect one to five images before generation.',
      );
    const form = new FormData();
    form.set('model', modelFor(context));
    form.set('prompt', request.prompt);
    form.set('n', String(Math.max(1, Math.min(request.count ?? 1, 4))));
    form.set('response_format', 'b64_json');
    if (request.mask) {
      const bytes = new Uint8Array(request.mask.data);
      form.set('mask', new Blob([bytes], { type: 'image/png' }), 'mask.png');
    }
    request.images.forEach((image, index) => {
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(image.mimeType))
        throw new AIProviderError('unsupported', 'Input image must be PNG, JPEG, or WebP.');
      const bytes = new Uint8Array(image.data.byteLength);
      bytes.set(image.data);
      form.append('image[]', new Blob([bytes], { type: image.mimeType }), `input-${index}.png`);
    });
    const response = await this.request('/images/edits', { method: 'POST', body: form }, context);
    if (response.status === 400 || response.status === 422)
      throw new AIProviderError(
        'unsupported',
        request.mask
          ? 'This Provider rejected masked editing. Check its model and mask support; no unmasked request was sent.'
          : 'This Provider rejected multi-image editing. Check the model and image-edit capability.',
      );
    if (!response.ok) await errorFromResponse(response);
    return this.parseImages(await response.json());
  }

  private parseImages(payload: unknown) {
    if (
      !payload ||
      typeof payload !== 'object' ||
      !('data' in payload) ||
      !Array.isArray(payload.data)
    ) {
      throw new AIProviderError(
        'invalid_response',
        'Provider response did not contain generated images.',
      );
    }
    const images = payload.data.map((item) => {
      const base64 = typeof item?.b64_json === 'string' ? item.b64_json : undefined;
      if (!base64)
        throw new AIProviderError(
          'invalid_response',
          'Provider must return image data in b64_json format for this local workflow.',
        );
      const binary = atob(base64);
      return {
        mimeType: 'image/png',
        data: Uint8Array.from(binary, (character) => character.charCodeAt(0)),
      };
    });
    return { images };
  }

  private async request(
    path: string,
    request: { method: string; body?: BodyInit },
    context: ProviderRequestContext,
  ) {
    if (context.signal?.aborted)
      throw new AIProviderError('timeout', 'The AI request was cancelled.');
    const controller = new AbortController();
    const cancel = () => controller.abort();
    context.signal?.addEventListener?.('abort', cancel, { once: true });
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await this.fetchClient(`${normalizeBaseUrl(context.config.baseUrl)}${path}`, {
        ...request,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${getApiKey(context)}`,
          ...(typeof request.body === 'string' ? { 'Content-Type': 'application/json' } : {}),
        },
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted)
        throw new AIProviderError('timeout', 'The Provider request timed out.');
      if (error instanceof AIProviderError) throw error;
      throw new AIProviderError(
        'network',
        'Unable to reach the Provider. Check the base URL and browser CORS support.',
      );
    } finally {
      clearTimeout(timer);
      context.signal?.removeEventListener?.('abort', cancel);
    }
  }
}

export function createOpenAICompatibleProvider(fetchClient?: FetchClient) {
  return new OpenAICompatibleProvider(fetchClient);
}
