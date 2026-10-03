import { useEffect, useState, useSyncExternalStore } from 'react';
import type { CandidateTray } from '@open-industrial-design/actions';
import { useLocalization } from './localization';

export interface CandidateTrayProps {
  tray: CandidateTray;
  busyCandidateId?: string;
  loading?: boolean;
  status?: string;
  onDiscard(candidateId: string): void;
  onKeep(candidateId: string): void;
}

/** Generated images remain here until the user explicitly keeps one as a Variant. */
export function CandidateTrayPanel({
  tray,
  busyCandidateId,
  loading = false,
  onDiscard,
  onKeep,
  status,
}: CandidateTrayProps) {
  const { t } = useLocalization();
  const state = useSyncExternalStore(tray.subscribe, tray.getState, tray.getState);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    const nextUrls = Object.fromEntries(
      state.items.flatMap((item) => {
        const image = tray.getPreview(item.id);
        if (!image) return [];
        const bytes = new Uint8Array(image.data.byteLength);
        bytes.set(image.data);
        return [[item.id, URL.createObjectURL(new Blob([bytes.buffer], { type: image.mimeType }))]];
      }),
    );
    setPreviewUrls(nextUrls);
    return () => Object.values(nextUrls).forEach((url) => URL.revokeObjectURL(url));
  }, [state.items, tray]);

  if (!state.items.length && !loading && !status) return null;
  return (
    <section aria-label={t('candidate.title')} className="candidate-tray">
      <h3>{t('candidate.title')}</h3>
      <p>{t('candidate.description')}</p>
      {loading ? <p className="candidate-tray__loading">{t('candidate.loading')}</p> : null}
      {status ? (
        <p className="candidate-tray__status" role="status">
          {status}
        </p>
      ) : null}
      {!state.items.length && !loading ? (
        <p className="candidate-tray__empty">{t('candidate.empty')}</p>
      ) : null}
      {state.items.map((item) => (
        <article key={item.id}>
          {previewUrls[item.id] ? (
            <img alt={`${item.sourceDesignName} candidate`} src={previewUrls[item.id]} />
          ) : (
            <div
              aria-label={t('candidate.previewUnavailable')}
              className="candidate-tray__preview-fallback"
            />
          )}
          <strong>{item.sourceDesignName}</strong>
          <span>{item.mimeType}</span>
          {item.constraintSummary.length ? <small>{item.constraintSummary.join(' ')}</small> : null}
          <div>
            <button
              disabled={busyCandidateId === item.id}
              onClick={() => onKeep(item.id)}
              type="button"
            >
              {t('candidate.keep')}
            </button>
            <button
              disabled={busyCandidateId === item.id}
              onClick={() => onDiscard(item.id)}
              type="button"
            >
              {t('common.discard')}
            </button>
          </div>
        </article>
      ))}
    </section>
  );
}
