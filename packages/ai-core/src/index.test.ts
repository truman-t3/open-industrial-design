import { describe, expect, it } from 'vitest';
import {
  AIProviderError,
  CapabilityRouter,
  InMemoryProviderCredentialStore,
  ProviderRegistry,
  createTestProvider,
  type ProviderConfig,
} from './index';

const config: ProviderConfig = {
  id: 'test-config',
  type: 'test',
  name: 'Local test provider',
  model: 'test-model',
  rememberKey: false,
};

describe('AI provider abstraction', () => {
  it('routes a typed capability through a registered provider without domain or Canvas access', async () => {
    const registry = new ProviderRegistry();
    registry.register(createTestProvider());
    const router = new CapabilityRouter(registry);

    await expect(
      router.execute('text.generate', { prompt: 'Describe a lamp' }, { config }),
    ).resolves.toEqual({
      text: 'test:Describe a lamp',
    });
    expect(registry.list()).toEqual([
      expect.objectContaining({ type: 'test', capabilities: ['text.generate', 'vision.analyze'] }),
    ]);
    await expect(registry.get('test')?.testConnection({ config })).resolves.toEqual({
      ok: true,
      message: 'Test provider is ready.',
    });
  });

  it('reports unsupported capabilities through normalized provider errors', () => {
    const registry = new ProviderRegistry();
    registry.register(createTestProvider());
    const router = new CapabilityRouter(registry);

    expect(() => router.route('image.generate', 'test')).toThrow(AIProviderError);
    expect(() => router.route('image.generate', 'test')).toThrow(
      'does not support: image.generate',
    );
  });

  it('keeps API keys in a runtime credential store, outside serializable provider configuration', async () => {
    const credentials = new InMemoryProviderCredentialStore();
    await credentials.set(config.id, { apiKey: 'session-only-key' });

    expect(JSON.parse(JSON.stringify(config))).toEqual(config);
    expect(JSON.stringify(config)).not.toContain('session-only-key');
    expect(await credentials.get(config.id)).toEqual({ apiKey: 'session-only-key' });
    await credentials.clear(config.id);
    await expect(credentials.get(config.id)).resolves.toBeUndefined();
  });
});
