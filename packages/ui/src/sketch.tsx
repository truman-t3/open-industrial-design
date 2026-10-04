import { Excalidraw, exportToBlob } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import { useRef, useState } from 'react';
import { useLocalization } from './localization';
import { serializeSketchScene, parseSketchScene } from './sketch-scene';
export { parseSketchScene } from './sketch-scene';

export interface SketchSavePayload {
  source: Blob;
  preview: Blob;
}
export interface SketchWorkspaceProps {
  initialSource?: string;
  onCancel: () => void;
  onSave: (payload: SketchSavePayload) => Promise<void>;
}

export function SketchWorkspace({ onCancel, onSave, initialSource }: SketchWorkspaceProps) {
  const [initialData] = useState(() =>
    initialSource ? parseSketchScene(initialSource) : undefined,
  );
  const { locale, t } = useLocalization();
  const elements = useRef<readonly unknown[]>(initialData?.elements ?? []);
  const files = useRef<unknown>(initialData?.files ?? null);
  const background = useRef(initialData?.appState.viewBackgroundColor ?? '#ffffff');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const save = async () => {
    setSaveError(false);
    setSaving(true);
    try {
      const scene = serializeSketchScene(elements.current, files.current, background.current);
      const preview = await exportToBlob({
        appState: { exportBackground: true, viewBackgroundColor: background.current },
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
          <button className="button--secondary" type="button" disabled={saving} onClick={onCancel}>
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
        initialData={initialData}
        langCode={locale}
        onChange={(next, appState, nextFiles) => {
          elements.current = next as unknown[];
          files.current = nextFiles;
          background.current = appState.viewBackgroundColor;
        }}
      />
    </section>
  );
}
