/**
 * Model-agnostic AI provider contracts. This package intentionally has no UI,
 * Canvas, persistence-library, domain-model, or model-SDK dependencies.
 */

export type AICapability =
  | 'text.generate'
  | 'vision.analyze'
  | 'image.generate'
  | 'image.edit'
  | 'image.erase'
  | 'image.cutout'
  | 'image.variation';

export type ProviderErrorCode =
  | 'unauthorized'
  | 'rate_limit'
  | 'timeout'
  | 'unsupported'
  | 'network'
  | 'invalid_response'
  | 'unknown';

export class AIProviderError extends Error {
  constructor(
    public readonly code: ProviderErrorCode,
    message: string,
    public readonly providerType?: string,
  ) {
    super(message);
    this.name = 'AIProviderError';
  }
}

/** Serializable, non-secret BYOK configuration safe for local settings storage. */
export interface ProviderConfig {
  id: string;
  type: string;
  name: string;
  baseUrl?: string;
  model?: string;
  rememberKey: boolean;
  enabled?: boolean;
  /** Explicit user confirmation of the configured service/model's mask support. */
  supportsMask?: boolean;
  supportsTransparency?: boolean;
}

/** Runtime-only secret. It is deliberately excluded from ProviderConfig. */
export interface ProviderCredentials {
  apiKey: string;
}

export interface ProviderConfigRepository {
  list(): Promise<ProviderConfig[]>;
  get(id: string): Promise<ProviderConfig | undefined>;
  save(config: ProviderConfig): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface ProviderCredentialStore {
  get(configId: string): Promise<ProviderCredentials | undefined>;
  set(configId: string, credentials: ProviderCredentials): Promise<void>;
  clear(configId: string): Promise<void>;
}

/** Session-only credentials implementation for web BYOK flows. */
export class InMemoryProviderCredentialStore implements ProviderCredentialStore {
  private readonly credentials = new Map<string, ProviderCredentials>();

  async get(configId: string) {
    return this.credentials.get(configId);
  }

  async set(configId: string, credentials: ProviderCredentials) {
    this.credentials.set(configId, credentials);
  }

  async clear(configId: string) {
    this.credentials.delete(configId);
  }
}

/** Resolves session-only credentials before an optional local remembered-key store. */
export class LayeredProviderCredentialStore implements ProviderCredentialStore {
  constructor(
    private readonly session: ProviderCredentialStore,
    private readonly remembered?: ProviderCredentialStore,
  ) {}

  async get(configId: string) {
    return (await this.session.get(configId)) ?? this.remembered?.get(configId);
  }

  async set(configId: string, credentials: ProviderCredentials) {
    await this.session.set(configId, credentials);
  }

  async clear(configId: string) {
    await this.session.clear(configId);
    await this.remembered?.clear(configId);
  }
}

export interface ProviderDescriptor {
  /** Matches ProviderConfig.type, allowing multiple BYOK configurations per adapter. */
  type: string;
  name: string;
  capabilities: readonly AICapability[];
}

export interface TextGenerateRequest {
  prompt: string;
  system?: string;
  temperature?: number;
}

export interface VisionAnalyzeRequest {
  prompt: string;
  image: ProviderImageInput;
  /** Additional evidence in caller order; at most seven, for eight images in total. */
  references?: ProviderImageInput[];
}

export interface ImageGenerateRequest {
  prompt: string;
  aspectRatio?: string;
  count?: number;
}

export interface ImageEditRequest {
  prompt: string;
  images: ProviderImageInput[];
  mask?: ProviderImageInput;
  count?: number;
}

export interface ImageVariationRequest {
  image: ProviderImageInput;
  count?: number;
}

export interface ImageCutoutRequest extends ImageVariationRequest {
  prompt?: string;
}

/** Erasing always requires a real alpha mask, never an unmasked prompt-only fallback. */
export interface ImageEraseRequest extends ImageEditRequest {
  mask: ProviderImageInput;
}

/** Runtime input reference. Asset resolution remains outside the Provider adapter. */
export interface ProviderImageInput {
  mimeType: string;
  data: Uint8Array;
}

export interface TextGenerateResult {
  text: string;
}

export interface VisionAnalyzeResult {
  text: string;
  sections?: Record<string, string>;
}

export interface ImageResult {
  images: Array<{ mimeType: string; data: Uint8Array }>;
}

export interface AICapabilityRequests {
  'text.generate': TextGenerateRequest;
  'vision.analyze': VisionAnalyzeRequest;
  'image.generate': ImageGenerateRequest;
  'image.edit': ImageEditRequest;
  'image.erase': ImageEraseRequest;
  'image.cutout': ImageCutoutRequest;
  'image.variation': ImageVariationRequest;
}

export interface AICapabilityResults {
  'text.generate': TextGenerateResult;
  'vision.analyze': VisionAnalyzeResult;
  'image.generate': ImageResult;
  'image.edit': ImageResult;
  'image.erase': ImageResult;
  'image.cutout': ImageResult;
  'image.variation': ImageResult;
}

export interface ProviderRequestContext {
  config: ProviderConfig;
  credentials?: ProviderCredentials;
  /**
   * Deliberately mirrors only the cancellation surface adapters need, so this
   * package does not require browser or Node runtime type libraries.
   */
  signal?: AIRequestSignal;
}

export interface AIRequestSignal {
  readonly aborted: boolean;
  throwIfAborted?(): void;
  addEventListener?(type: 'abort', listener: () => void, options?: { once?: boolean }): void;
  removeEventListener?(type: 'abort', listener: () => void): void;
}

export interface ProviderConnectionResult {
  ok: boolean;
  message?: string;
}

export interface AIProvider {
  descriptor: ProviderDescriptor;
  testConnection(context: ProviderRequestContext): Promise<ProviderConnectionResult>;
  execute<C extends AICapability>(
    capability: C,
    request: AICapabilityRequests[C],
    context: ProviderRequestContext,
  ): Promise<AICapabilityResults[C]>;
}

export class ProviderRegistry {
  private readonly providers = new Map<string, AIProvider>();

  register(provider: AIProvider) {
    if (this.providers.has(provider.descriptor.type)) {
      throw new AIProviderError(
        'invalid_response',
        `Provider type is already registered: ${provider.descriptor.type}`,
        provider.descriptor.type,
      );
    }
    this.providers.set(provider.descriptor.type, provider);
  }

  unregister(type: string) {
    this.providers.delete(type);
  }

  get(type: string) {
    return this.providers.get(type);
  }

  list() {
    return [...this.providers.values()].map((provider) => provider.descriptor);
  }

  findSupporting(capability: AICapability) {
    return [...this.providers.values()].find((provider) =>
      provider.descriptor.capabilities.includes(capability),
    );
  }
}

export interface CapabilityRoute {
  provider: AIProvider;
  capability: AICapability;
}

/** Routes a capability to an adapter. It never mutates Canvas or domain state. */
export class CapabilityRouter {
  constructor(private readonly registry: ProviderRegistry) {}

  route(capability: AICapability, preferredProviderType?: string): CapabilityRoute {
    const provider = preferredProviderType
      ? this.registry.get(preferredProviderType)
      : this.registry.findSupporting(capability);
    if (!provider) {
      throw new AIProviderError(
        'unsupported',
        preferredProviderType
          ? `No registered provider matches: ${preferredProviderType}`
          : `No registered provider supports: ${capability}`,
        preferredProviderType,
      );
    }
    if (!provider.descriptor.capabilities.includes(capability)) {
      throw new AIProviderError(
        'unsupported',
        `Provider ${provider.descriptor.type} does not support: ${capability}`,
        provider.descriptor.type,
      );
    }
    return { provider, capability };
  }

  async execute<C extends AICapability>(
    capability: C,
    request: AICapabilityRequests[C],
    context: ProviderRequestContext,
  ): Promise<AICapabilityResults[C]> {
    const { provider } = this.route(capability, context.config.type);
    return provider.execute(capability, request, context);
  }

  async testConnection(
    config: ProviderConfig,
    credentials?: ProviderCredentials,
  ): Promise<ProviderConnectionResult> {
    const provider = this.registry.get(config.type);
    if (!provider) {
      throw new AIProviderError(
        'unsupported',
        `No registered provider matches: ${config.type}`,
        config.type,
      );
    }
    return provider.testConnection({ config, credentials });
  }
}

/** Deterministic no-network provider used by unit tests and local integration wiring. */
export function createTestProvider(type = 'test'): AIProvider {
  const descriptor: ProviderDescriptor = {
    type,
    name: 'Test provider',
    capabilities: ['text.generate', 'vision.analyze'],
  };
  return {
    descriptor,
    async testConnection() {
      return { ok: true, message: 'Test provider is ready.' };
    },
    async execute<C extends AICapability>(capability: C, request: AICapabilityRequests[C]) {
      if (capability === 'text.generate') {
        const textRequest = request as TextGenerateRequest;
        return { text: `test:${textRequest.prompt}` } as unknown as AICapabilityResults[C];
      }
      if (capability === 'vision.analyze') {
        const visionRequest = request as VisionAnalyzeRequest;
        return {
          text: `test analysis:${visionRequest.prompt}`,
          sections: { source: 'test-provider' },
        } as unknown as AICapabilityResults[C];
      }
      throw new AIProviderError('unsupported', `Unsupported test capability: ${capability}`, type);
    },
  };
}
