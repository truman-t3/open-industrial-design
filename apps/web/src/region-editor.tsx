import { useRef, useState } from 'react';
import type { EditRegion } from '@open-industrial-design/design-model';
import { useLocalization } from '@open-industrial-design/ui';
import { adjustEditRegion, rectangleBetween } from './edit-mask';

export function RegionEditor({
  source,
  region,
  disabled,
  onChange,
}: {
  source: { sourceNodeId: string; sourceAssetId: string; previewUrl: string };
  region?: EditRegion;
  disabled: boolean;
  onChange(region?: EditRegion): void;
}) {
  const { t } = useLocalization();
  const start = useRef<[number, number] | undefined>(undefined);
  const [draft, setDraft] = useState<ReturnType<typeof rectangleBetween>>();
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const current = draft ?? region;
  const point = (event: React.PointerEvent<HTMLDivElement>): [number, number] => {
    const box = event.currentTarget.getBoundingClientRect();
    return [(event.clientX - box.left) / box.width, (event.clientY - box.top) / box.height];
  };
  return (
    <section className="region-editor" aria-label={t('generation.mask.title')}>
      <p>{t('generation.mask.help')}</p>
      <div
        className="region-editor__image"
        onPointerDown={(event) => {
          if (disabled || !loaded || event.button !== 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          start.current = point(event);
          setDraft(undefined);
        }}
        onPointerMove={(event) => {
          if (start.current) setDraft(rectangleBetween(start.current, point(event)));
        }}
        onPointerUp={(event) => {
          if (!start.current) return;
          const rect = rectangleBetween(start.current, point(event));
          start.current = undefined;
          setDraft(undefined);
          if (rect.width > 0.005 && rect.height > 0.005)
            onChange({
              ...rect,
              sourceNodeId: source.sourceNodeId,
              sourceAssetId: source.sourceAssetId,
            });
        }}
        onPointerCancel={() => {
          start.current = undefined;
          setDraft(undefined);
        }}
      >
        <img
          src={source.previewUrl}
          alt={t('generation.source')}
          draggable={false}
          onLoad={() => {
            setLoaded(true);
            setFailed(false);
          }}
          onError={() => {
            setFailed(true);
            setLoaded(false);
          }}
        />
        {current ? (
          <span
            className="region-editor__selection"
            style={{
              left: `${current.x * 100}%`,
              top: `${current.y * 100}%`,
              width: `${current.width * 100}%`,
              height: `${current.height * 100}%`,
            }}
          />
        ) : null}
      </div>
      {!loaded && !failed ? <p role="status">{t('generation.mask.loading')}</p> : null}
      {failed ? <p role="alert">{t('generation.previewUnavailable')}</p> : null}
      {region ? <p role="status">{t('generation.mask.selected')}</p> : null}
      {region ? (
        <details className="region-editor__precision">
          <summary>{t('generation.mask.precision')}</summary>
          <div className="region-editor__fields">
            {(['x', 'y', 'width', 'height'] as const).map((field) => (
              <label key={field}>
                {t(`generation.mask.${field}`)}
                <input
                  type="number"
                  min={field === 'width' || field === 'height' ? 1 : 0}
                  max={100}
                  step={1}
                  value={Math.round(region[field] * 10000) / 100}
                  disabled={disabled || !loaded || failed}
                  onChange={(event) => {
                    if (event.target.value !== '')
                      onChange(adjustEditRegion(region, field, event.target.valueAsNumber));
                  }}
                />
              </label>
            ))}
          </div>
        </details>
      ) : null}
      <button type="button" disabled={disabled || !region} onClick={() => onChange(undefined)}>
        {t('generation.mask.clear')}
      </button>
    </section>
  );
}
