import { useEffect, useRef, useState } from 'react';
import { useLocalization } from '@open-industrial-design/ui';
import type { WorkspaceInspectorProps } from './workspace-inspector';

type Generation = NonNullable<WorkspaceInspectorProps['generation']>;

export function CandidateReview({
  generation,
  initialId,
  onClose,
}: {
  generation: Generation;
  initialId: string;
  onClose(): void;
}) {
  const { t } = useLocalization();
  const dialog = useRef<HTMLDialogElement>(null);
  const [selectedId, setSelectedId] = useState(initialId);
  const [mode, setMode] = useState<'source' | 'candidates' | 'grid'>('source');
  const [comparisonId, setComparisonId] = useState(
    generation.candidates.find((item) => item.id !== initialId)?.id,
  );
  const candidate = generation.candidates.find((item) => item.id === selectedId);
  useEffect(() => {
    if (!candidate) onClose();
  }, [candidate, onClose]);
  const source = generation.inputs.find((input) => input.role === 'base') ?? generation.inputs[0];
  const comparison =
    generation.candidates.find((item) => item.id === comparisonId && item.id !== candidate?.id) ??
    generation.candidates.find((item) => item.id !== candidate?.id);
  const label = (id: string) => {
    const index = generation.candidates.findIndex((item) => item.id === id);
    const item = generation.candidates[index];
    const number = t('generation.candidateNumber', { number: index + 1 });
    return item?.view ? `${number} · ${t(`generation.view.${item.view}`)}` : number;
  };
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  const busy = Boolean(generation.busyCandidateId);
  return (
    <dialog
      className="candidate-review"
      ref={dialog}
      onCancel={onClose}
      aria-labelledby="candidate-review-title"
    >
      <header>
        <h2 id="candidate-review-title">{t('generation.compare')}</h2>
        <button type="button" onClick={onClose}>
          {t('common.close')}
        </button>
      </header>
      <p>{t('generation.review')}</p>
      {generation.node?.localEdit ? <p>{t('generation.mask.reviewHint')}</p> : null}
      <div className="candidate-review__controls">
        <div role="group" aria-label={t('generation.compareMode')}>
          <button type="button" aria-pressed={mode === 'source'} onClick={() => setMode('source')}>
            {t('generation.compareSource')}
          </button>
          <button
            type="button"
            aria-pressed={mode === 'candidates'}
            disabled={generation.candidates.length < 2}
            onClick={() => setMode('candidates')}
          >
            {t('generation.compareCandidates')}
          </button>
          <button type="button" aria-pressed={mode === 'grid'} onClick={() => setMode('grid')}>
            {t('generation.compareGrid')}
          </button>
        </div>
        {mode === 'candidates' && comparison ? (
          <label>
            {t('generation.compareWith')}
            <select value={comparison.id} onChange={(event) => setComparisonId(event.target.value)}>
              {generation.candidates
                .filter((item) => item.id !== candidate?.id)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {label(item.id)}
                  </option>
                ))}
            </select>
          </label>
        ) : null}
      </div>
      {mode === 'grid' ? (
        <div
          className="candidate-review__grid"
          role="group"
          aria-label={t('generation.compareGrid')}
        >
          {generation.candidates.map((item) => (
            <button
              type="button"
              key={item.id}
              aria-pressed={item.id === candidate?.id}
              aria-label={label(item.id)}
              disabled={busy}
              onClick={() => setSelectedId(item.id)}
            >
              <strong>{label(item.id)}</strong>
              {generation.previewUrls[item.id] ? (
                <img src={generation.previewUrls[item.id]} alt="" />
              ) : (
                <span>{t('generation.previewUnavailable')}</span>
              )}
              {item.inputSignature !== generation.signature ? (
                <span>{t('generation.stale')}</span>
              ) : null}
            </button>
          ))}
        </div>
      ) : (
        <div className="candidate-review__comparison">
          <figure>
            <figcaption>
              {mode === 'candidates' && comparison ? label(comparison.id) : t('generation.source')}
            </figcaption>
            {mode === 'candidates' && comparison?.inputSignature !== generation.signature ? (
              <p role="status">{t('generation.stale')}</p>
            ) : null}
            {mode === 'candidates' ? (
              comparison && generation.previewUrls[comparison.id] ? (
                <img src={generation.previewUrls[comparison.id]} alt={label(comparison.id)} />
              ) : (
                <p>{t('generation.previewUnavailable')}</p>
              )
            ) : source?.previewUrl ? (
              <img src={source.previewUrl} alt={source.label} />
            ) : (
              <p>{t('generation.previewUnavailable')}</p>
            )}
          </figure>
          <figure>
            <figcaption>{candidate ? label(candidate.id) : t('generation.candidates')}</figcaption>
            {candidate && generation.previewUrls[candidate.id] ? (
              <img src={generation.previewUrls[candidate.id]} alt={label(candidate.id)} />
            ) : (
              <p>{t('generation.previewUnavailable')}</p>
            )}
          </figure>
        </div>
      )}
      {mode !== 'grid' ? (
        <nav className="candidate-review__thumbnails" aria-label={t('generation.candidates')}>
          {generation.candidates.map((item, index) => (
            <button
              type="button"
              key={item.id}
              aria-pressed={item.id === candidate?.id}
              aria-label={label(item.id)}
              disabled={busy}
              onClick={() => setSelectedId(item.id)}
            >
              {generation.previewUrls[item.id] ? (
                <img src={generation.previewUrls[item.id]} alt="" />
              ) : (
                index + 1
              )}
              <span>{label(item.id)}</span>
            </button>
          ))}
        </nav>
      ) : null}
      {candidate?.inputSignature !== generation.signature && candidate ? (
        <p role="status">{t('generation.stale')}</p>
      ) : null}
      {generation.status ? <p role="status">{generation.status}</p> : null}
      <footer>
        {candidate ? (
          <strong>{t('generation.reviewTarget', { name: label(candidate.id) })}</strong>
        ) : null}
        <button
          type="button"
          disabled={!candidate || busy}
          className="button--primary"
          onClick={() => candidate && generation.onKeep(candidate.id, 'design')}
        >
          {t('generation.keepDesign')}
        </button>
        <button
          type="button"
          disabled={!candidate || busy}
          onClick={() => candidate && generation.onKeep(candidate.id, 'reference')}
        >
          {t('generation.keepReference')}
        </button>
        <button
          type="button"
          disabled={!candidate || busy}
          onClick={() => candidate && generation.onDiscard(candidate.id)}
        >
          {t('common.discard')}
        </button>
      </footer>
    </dialog>
  );
}
