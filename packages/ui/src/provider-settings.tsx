import { useEffect, useState } from 'react';
import type { ProviderConfig } from '@open-industrial-design/ai-core';
import { useLocalization } from './localization';

export interface ProviderSettingsDraft {
  id?: string;
  name: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  rememberKey: boolean;
  supportsMask?: boolean;
  supportsTransparency?: boolean;
}

export interface ProviderSettingsProps {
  configs: readonly ProviderConfig[];
  open: boolean;
  busy?: boolean;
  status?: string;
  hasCredentials?(configId: string): Promise<boolean>;
  onClose(): void;
  onDelete(config: ProviderConfig): Promise<void>;
  onSave(draft: ProviderSettingsDraft): Promise<void>;
  onTest(draft: ProviderSettingsDraft): Promise<void>;
}

const defaultDraft: ProviderSettingsDraft = {
  name: 'OpenAI-compatible Provider',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4.1-mini',
  apiKey: '',
  rememberKey: false,
};

function toDraft(
  config?: ProviderConfig,
  defaultName = 'OpenAI-compatible Provider',
): ProviderSettingsDraft {
  return config
    ? {
        id: config.id,
        name: config.name,
        baseUrl: config.baseUrl ?? defaultDraft.baseUrl,
        model: config.model ?? defaultDraft.model,
        apiKey: '',
        rememberKey: config.rememberKey,
        supportsMask: config.supportsMask ?? false,
        supportsTransparency: config.supportsTransparency ?? false,
      }
    : { ...defaultDraft, name: defaultName };
}

function ProviderForm({
  config,
  busy,
  hasCredentials,
  onDelete,
  onSave,
  onTest,
}: {
  config?: ProviderConfig;
  busy?: boolean;
  hasCredentials?(configId: string): Promise<boolean>;
  onDelete(config: ProviderConfig): Promise<void>;
  onSave(draft: ProviderSettingsDraft): Promise<void>;
  onTest(draft: ProviderSettingsDraft): Promise<void>;
}) {
  const { t } = useLocalization();
  const [draft, setDraft] = useState<ProviderSettingsDraft>(() =>
    toDraft(config, t('provider.defaultName')),
  );
  useEffect(() => setDraft(toDraft(config, t('provider.defaultName'))), [config, t]);
  const [credentialState, setCredentialState] = useState<'checking' | 'available' | 'missing'>(
    'checking',
  );
  const [credentialRevision, setCredentialRevision] = useState(0);
  useEffect(() => {
    let cancelled = false;
    if (!config || !hasCredentials) {
      setCredentialState('missing');
      return;
    }
    setCredentialState('checking');
    void hasCredentials(config.id).then(
      (available) => {
        if (!cancelled) setCredentialState(available ? 'available' : 'missing');
      },
      () => {
        if (!cancelled) setCredentialState('missing');
      },
    );
    return () => {
      cancelled = true;
    };
  }, [config, hasCredentials, credentialRevision]);
  const hasDraftKey = Boolean(draft.apiKey.trim());
  const update = <K extends keyof ProviderSettingsDraft>(key: K, value: ProviderSettingsDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  return (
    <form
      className="provider-settings__form"
      onSubmit={(event) => {
        event.preventDefault();
        void onSave(draft).then(() => {
          setDraft((current) => ({ ...current, apiKey: '' }));
          setCredentialRevision((current) => current + 1);
        });
      }}
    >
      <label>
        {t('provider.name')}
        <input
          onChange={(event) => update('name', event.target.value)}
          required
          value={draft.name}
        />
      </label>
      <label>
        {t('provider.baseUrl')}
        <input
          onChange={(event) => update('baseUrl', event.target.value)}
          required
          type="url"
          value={draft.baseUrl}
        />
      </label>
      <label>
        {t('provider.model')}
        <input
          onChange={(event) => update('model', event.target.value)}
          required
          value={draft.model}
        />
      </label>
      <label>
        {t('provider.apiKey')} {config ? <small>{t('provider.keepKey')}</small> : null}
        <input
          autoComplete="off"
          onChange={(event) => update('apiKey', event.target.value)}
          placeholder={config ? '••••••••' : t('provider.pasteKey')}
          required={!config}
          type="password"
          value={draft.apiKey}
        />
      </label>
      <label className="provider-settings__remember">
        <input
          checked={draft.rememberKey}
          onChange={(event) => update('rememberKey', event.target.checked)}
          type="checkbox"
        />
        {t('provider.remember')}
      </label>
      <p className="provider-settings__privacy">{t('provider.privacy')}</p>
      <label className="provider-settings__remember">
        <input
          type="checkbox"
          checked={draft.supportsMask ?? false}
          onChange={(event) => update('supportsMask', event.target.checked)}
        />
        {t('provider.supportsMask')}
      </label>
      <p className="provider-settings__privacy">{t('provider.maskHint')}</p>
      <label className="provider-settings__remember">
        <input
          type="checkbox"
          checked={draft.supportsTransparency ?? false}
          onChange={(event) => update('supportsTransparency', event.target.checked)}
        />
        {t('provider.supportsTransparency')}
      </label>
      <div className="provider-settings__buttons">
        <button className="button--primary" disabled={busy} type="submit">
          {t('provider.save')}
        </button>
        <button
          disabled={busy || (!hasDraftKey && credentialState !== 'available')}
          onClick={() => void onTest(draft)}
          type="button"
        >
          {t('provider.test')}
        </button>
        {config ? (
          <button disabled={busy} onClick={() => void onDelete(config)} type="button">
            {t('provider.delete')}
          </button>
        ) : null}
      </div>
      {!hasDraftKey ? (
        <p className="provider-settings__privacy" role="status">
          {t(
            credentialState === 'checking'
              ? 'provider.keyChecking'
              : credentialState === 'available'
                ? 'provider.keyAvailable'
                : 'provider.testKeyRequired',
          )}
        </p>
      ) : null}
    </form>
  );
}

/** Settings UI only emits drafts; it has no SDK, Router, or credential-store access. */
export function ProviderSettings({
  configs,
  open,
  busy,
  status,
  hasCredentials,
  onClose,
  onDelete,
  onSave,
  onTest,
}: ProviderSettingsProps) {
  const { t } = useLocalization();
  const [selectedId, setSelectedId] = useState<string>();
  useEffect(() => {
    if (open) setSelectedId((current) => current ?? configs[0]?.id);
  }, [configs, open]);
  if (!open) return null;
  const selected = configs.find((config) => config.id === selectedId);
  return (
    <div className="provider-settings__backdrop" onMouseDown={onClose} role="presentation">
      <section
        aria-label={t('workspace.providerSettings')}
        className="provider-settings"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header>
          <div>
            <h2>{t('provider.title')}</h2>
            <p>{t('provider.description')}</p>
          </div>
          <button onClick={onClose} type="button">
            {t('common.close')}
          </button>
        </header>
        <div className="provider-settings__content">
          <aside>
            <button onClick={() => setSelectedId(undefined)} type="button">
              + {t('provider.add')}
            </button>
            {configs.map((config) => (
              <button
                className={config.id === selectedId ? 'provider-settings__selected' : undefined}
                key={config.id}
                onClick={() => setSelectedId(config.id)}
                type="button"
              >
                {config.name}
              </button>
            ))}
          </aside>
          <div>
            <ProviderForm
              busy={busy}
              config={selected}
              hasCredentials={hasCredentials}
              key={selected?.id ?? 'new'}
              onDelete={onDelete}
              onSave={onSave}
              onTest={onTest}
            />
            {status ? (
              <p className="provider-settings__status" role="status">
                {status}
              </p>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
