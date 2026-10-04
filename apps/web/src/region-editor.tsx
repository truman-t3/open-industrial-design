import { useRef, useState } from 'react';
import type { EditRegion, MaskPoint } from '@open-industrial-design/design-model';
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
  const [mode, setMode] = useState<'rectangle' | 'polygon' | 'brush'>(
    region?.shape?.kind ?? 'rectangle',
  );
  const [vertices, setVertices] = useState<MaskPoint[]>([]);
  const [stroke, setStroke] = useState<MaskPoint[]>([]);
  const strokeRef = useRef<MaskPoint[]>([]);
  const [diameter, setDiameter] = useState(6);
  const [imageSize, setImageSize] = useState({ width: 1000, height: 1000 });
  const [limit, setLimit] = useState(false);
  const binding = {
    sourceNodeId: source.sourceNodeId,
    sourceAssetId: source.sourceAssetId,
    x: 0,
    y: 0,
    width: 1,
    height: 1,
  };
  const resetDraft = () => {
    start.current = undefined;
    strokeRef.current = [];
    setStroke([]);
    setDraft(undefined);
    setVertices([]);
    setLimit(false);
  };
  const current = draft ?? region;
  const point = (event: React.PointerEvent<HTMLDivElement>): [number, number] => {
    const box = event.currentTarget.getBoundingClientRect();
    return [(event.clientX - box.left) / box.width, (event.clientY - box.top) / box.height].map(
      (value) => Math.max(0, Math.min(1, value)),
    ) as MaskPoint;
  };
  const pointsText = (points: MaskPoint[]) =>
    points.map(([x, y]) => `${x * imageSize.width},${y * imageSize.height}`).join(' ');
  const addStrokePoint = (next: MaskPoint) => {
    if (strokeRef.current.length >= 1024) {
      setLimit(true);
      return;
    }
    const last = strokeRef.current.at(-1);
    if (last && Math.hypot(next[0] - last[0], next[1] - last[1]) < 0.002) return;
    strokeRef.current = [...strokeRef.current, next];
    setStroke(strokeRef.current);
  };
  return (
    <section className="region-editor" aria-label={t('generation.mask.title')}>
      <p>{t('generation.mask.help')}</p>
      <label>
        {t('generation.mask.tool')}
        <select
          aria-label={t('generation.mask.tool')}
          value={mode}
          disabled={disabled}
          onChange={(event) => {
            resetDraft();
            setMode(event.target.value as typeof mode);
          }}
        >
          <option value="rectangle">{t('generation.mask.rectangle')}</option>
          <option value="polygon">{t('generation.mask.polygon')}</option>
          <option value="brush">{t('generation.mask.brush')}</option>
        </select>
      </label>
      {mode === 'brush' ? (
        <label>
          {t('generation.mask.diameter')}
          <input
            type="range"
            min={1}
            max={50}
            value={diameter}
            disabled={disabled}
            onChange={(event) => setDiameter(Number(event.target.value))}
          />
          <output>{diameter}%</output>
        </label>
      ) : null}
      {mode === 'polygon' ? <p>{t('generation.mask.polygonHelp')}</p> : null}
      <div
        className="region-editor__image"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            resetDraft();
          }
        }}
        onPointerDown={(event) => {
          if (disabled || !loaded || event.button !== 0) return;
          event.preventDefault();
          event.currentTarget.focus({ preventScroll: true });
          if (mode === 'polygon') {
            if (vertices.length < 256) setVertices([...vertices, point(event)]);
            else setLimit(true);
            return;
          }
          event.currentTarget.setPointerCapture(event.pointerId);
          if (mode === 'brush') {
            strokeRef.current = [];
            addStrokePoint(point(event));
            return;
          }
          start.current = point(event);
          setDraft(undefined);
        }}
        onPointerMove={(event) => {
          if (disabled) return;
          if (mode === 'brush' && strokeRef.current.length) {
            addStrokePoint(point(event));
            return;
          }
          if (start.current) setDraft(rectangleBetween(start.current, point(event)));
        }}
        onPointerUp={(event) => {
          if (disabled) {
            resetDraft();
            return;
          }
          if (mode === 'brush' && strokeRef.current.length) {
            addStrokePoint(point(event));
            const existing = region?.shape?.kind === 'brush' ? region.shape.strokes : [];
            if (
              existing.length >= 128 ||
              existing.reduce((n, s) => n + s.points.length, 0) + strokeRef.current.length > 4096
            )
              setLimit(true);
            else
              onChange({
                ...binding,
                shape: {
                  kind: 'brush',
                  strokes: [...existing, { points: strokeRef.current, radius: diameter / 200 }],
                },
              });
            strokeRef.current = [];
            setStroke([]);
            return;
          }
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
          strokeRef.current = [];
          setStroke([]);
        }}
      >
        <img
          src={source.previewUrl}
          alt={t('generation.source')}
          draggable={false}
          onLoad={(event) => {
            setImageSize({
              width: event.currentTarget.naturalWidth,
              height: event.currentTarget.naturalHeight,
            });
            setLoaded(true);
            setFailed(false);
          }}
          onError={() => {
            setFailed(true);
            setLoaded(false);
          }}
        />
        {current && !('shape' in current && current.shape) ? (
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
        <svg
          className="region-editor__overlay"
          viewBox={`0 0 ${imageSize.width} ${imageSize.height}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {region?.shape?.kind === 'polygon' && !vertices.length ? (
            <polygon
              points={pointsText(region.shape.points)}
              fill="#2563ff33"
              stroke="#2563ff"
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
          {vertices.length ? (
            <polyline
              points={pointsText(vertices)}
              fill="#2563ff33"
              stroke="#2563ff"
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
          {vertices.map(([x, y], i) => (
            <circle
              key={i}
              cx={x * imageSize.width}
              cy={y * imageSize.height}
              r={imageSize.width / 100}
              fill="#2563ff"
            />
          ))}
          {[
            ...(region?.shape?.kind === 'brush' ? region.shape.strokes : []),
            ...(stroke.length ? [{ points: stroke, radius: diameter / 200 }] : []),
          ].map((item, i) =>
            item.points.length === 1 ? (
              <circle
                key={i}
                cx={item.points[0][0] * imageSize.width}
                cy={item.points[0][1] * imageSize.height}
                r={item.radius * Math.min(imageSize.width, imageSize.height)}
                fill="#2563ff66"
              />
            ) : (
              <polyline
                key={i}
                points={pointsText(item.points)}
                fill="none"
                stroke="#2563ff66"
                strokeWidth={item.radius * 2 * Math.min(imageSize.width, imageSize.height)}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ),
          )}
        </svg>
      </div>
      {mode === 'polygon' ? (
        <div className="region-editor__actions">
          <button
            type="button"
            disabled={disabled || vertices.length < 3}
            onClick={() => {
              onChange({ ...binding, shape: { kind: 'polygon', points: vertices } });
              setVertices([]);
            }}
          >
            {t('generation.mask.finish')}
          </button>
          <button
            type="button"
            disabled={disabled || !vertices.length}
            onClick={() => setVertices(vertices.slice(0, -1))}
          >
            {t('generation.mask.undoPoint')}
          </button>
        </div>
      ) : null}
      {mode === 'brush' && region?.shape?.kind === 'brush' ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            if (region.shape?.kind !== 'brush') return;
            const strokes = region.shape.strokes.slice(0, -1);
            onChange(strokes.length ? { ...region, shape: { kind: 'brush', strokes } } : undefined);
          }}
        >
          {t('generation.mask.undoStroke')}
        </button>
      ) : null}
      {limit ? <p role="alert">{t('generation.mask.limit')}</p> : null}
      {!loaded && !failed ? <p role="status">{t('generation.mask.loading')}</p> : null}
      {failed ? <p role="alert">{t('generation.previewUnavailable')}</p> : null}
      {region ? <p role="status">{t('generation.mask.selected')}</p> : null}
      {region && !region.shape ? (
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
      <button
        type="button"
        disabled={disabled || (!region && !vertices.length)}
        onClick={() => {
          resetDraft();
          onChange(undefined);
        }}
      >
        {t('generation.mask.clear')}
      </button>
    </section>
  );
}
