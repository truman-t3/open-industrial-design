import { Excalidraw, exportToBlob } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import { useRef, useState } from 'react';
import { useLocalization } from './localization';

export interface SketchSavePayload {
  source: Blob;
  preview: Blob;
}
export interface SketchWorkspaceProps {
  onCancel: () => void;
  onSave: (payload: SketchSavePayload) => Promise<void>;
}

export function SketchWorkspace({ onCancel, onSave }: SketchWorkspaceProps) {
  const { locale, t } = useLocalization();
  const elements = useRef<readonly unknown[]>([]);
  const files = useRef<unknown>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const save = async () => {
    setSaveError(false);
    setSaving(true);
    try {
      const scene = JSON.stringify({ type: 'excalidraw', version: 2, elements: elements.current });
      const preview = await exportToBlob({
        appState: { exportBackground: true, viewBackgroundColor: '#f8f7f2' },
        elements: elements.current as never,
        files: files.current as never,
        maxWidthOrHeight: 960,
        mimeType: 'image/png',
      });
      await onSave({ source: new Blob([scene], { type: 'application/json' }), preview });
    } catch {
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  };
  return (
    <section className="sketch-workspace" aria-label={t('sketch.workspace')}>
      <header>
        <div className="sketch-workspace__identity">
          <span className="sketch-workspace__mark" aria-hidden="true" />
          <div>
            <strong>{t('sketch.workspace')}</strong>
            <span>{t('sketch.subtitle')}</span>
          </div>
        </div>
        <div className="sketch-workspace__actions">
          <button className="button--secondary" type="button" onClick={onCancel}>
            {t('common.cancel')}
          </button>
          <button
            className="button--primary"
            type="button"
            disabled={saving}
            onClick={() => void save()}
          >
            {saving ? t('save.saving') : t('common.done')}
          </button>
        </div>
      </header>
      {saveError ? (
        <p className="sketch-workspace__error" role="alert">
          {t('sketch.saveFailed')}
        </p>
      ) : null}
      <Excalidraw
        langCode={locale}
        onChange={(next, _, nextFiles) => {
          elements.current = next as unknown[];
          files.current = nextFiles;
        }}
      />
    </section>
  );
}
