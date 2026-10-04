import { useState } from 'react';
import type { PatternPlacement } from '@open-industrial-design/design-model';
import { useLocalization } from '@open-industrial-design/ui';

export function PatternEditor({
  base,
  pattern,
  value,
  disabled,
  onChange,
}: {
  base?: string;
  pattern?: string;
  value: PatternPlacement;
  disabled: boolean;
  onChange(value: PatternPlacement): void;
}) {
  const { t } = useLocalization();
  const [draft, setDraft] = useState<PatternPlacement>();
  const p = draft ?? value;
  const point = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      ...value,
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    };
  };
  return (
    <section className="region-editor" aria-label={t('generation.tool.pattern')}>
      <p>{t('generation.pattern.help')}</p>
      {base && pattern ? (
        <div
          className="pattern-editor__preview"
          onPointerDown={(event) => {
            if (disabled || event.button !== 0) return;
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            setDraft(point(event));
          }}
          onPointerMove={(event) => {
            if (draft && !disabled) setDraft(point(event));
          }}
          onPointerUp={(event) => {
            if (draft && !disabled) onChange(point(event));
            setDraft(undefined);
          }}
          onPointerCancel={() => setDraft(undefined)}
        >
          <img src={base} alt={t('generation.source')} draggable={false} />
          <img
            className="pattern-editor__overlay"
            src={pattern}
            alt=""
            draggable={false}
            style={{
              left: `${p.x * 100}%`,
              top: `${p.y * 100}%`,
              width: `${p.width * 100}%`,
              height: `${p.height * 100}%`,
              opacity: p.opacity,
              transform: `translate(-50%, -50%) rotate(${p.rotation}deg)`,
            }}
          />
        </div>
      ) : (
        <p role="status">{t('generation.pattern.inputs')}</p>
      )}
      <div className="region-editor__fields">
        {(['x', 'y', 'width', 'height', 'rotation', 'opacity'] as const).map((field) => (
          <label key={field}>
            {t(`generation.pattern.${field}`)}
            <input
              type="number"
              disabled={disabled}
              min={field === 'rotation' ? -180 : field === 'width' || field === 'height' ? 1 : 0}
              max={field === 'rotation' ? 180 : field === 'width' || field === 'height' ? 200 : 100}
              step={1}
              value={Math.round(value[field] * (field === 'rotation' ? 1 : 100))}
              onChange={(event) => {
                const n = event.target.valueAsNumber;
                if (!Number.isFinite(n)) return;
                const min =
                    field === 'rotation' ? -180 : field === 'width' || field === 'height' ? 1 : 0,
                  max =
                    field === 'rotation'
                      ? 180
                      : field === 'width' || field === 'height'
                        ? 200
                        : 100;
                onChange({
                  ...value,
                  [field]: Math.max(min, Math.min(max, n)) / (field === 'rotation' ? 1 : 100),
                });
              }}
            />
          </label>
        ))}
      </div>
    </section>
  );
}
