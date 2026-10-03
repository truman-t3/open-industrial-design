import { useEffect, useState } from 'react';
import { translate, type AppLocale } from '@open-industrial-design/core';
import type { GenerationNode, Viewport } from '@open-industrial-design/design-model';

/** DOM controls over one selected Konva card; drafts never call a Provider. */
export function GenerationCardEditor({
  node,
  viewport,
  locale,
  busy,
  ready,
  providerName,
  status,
  onCommit,
  onRun,
  interactive = true,
}: {
  node: GenerationNode;
  viewport: Viewport;
  locale: AppLocale;
  busy: boolean;
  ready: boolean;
  providerName?: string;
  status?: string;
  onCommit(direction: string): void;
  onRun(direction: string): void;
  interactive?: boolean;
}) {
  const [draft, setDraft] = useState(node.direction);
  useEffect(() => setDraft(node.direction), [node.direction]);
  if (viewport.zoom < 0.8) return null;
  const commit = () => {
    if (draft !== node.direction) onCommit(draft);
  };
  return (
    <div
      className="generation-card-editor"
      style={{
        left: node.x * viewport.zoom + viewport.x,
        top: node.y * viewport.zoom + viewport.y,
        width: node.width,
        height: node.height,
        transform: `scale(${viewport.zoom})`,
        pointerEvents: interactive ? 'auto' : 'none',
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <textarea
        aria-label={translate(locale, 'generation.direction')}
        className="generation-card-editor__direction"
        value={draft}
        disabled={busy || node.locked}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
      />
      <div className="generation-card-editor__meta">
        <span
          className="generation-card-editor__provider"
          title={
            ready && providerName
              ? translate(locale, 'generation.cardProvider', {
                  name: providerName,
                  count: node.count,
                })
              : translate(locale, 'generation.cardProviderMissing')
          }
        >
          {ready && providerName
            ? translate(locale, 'generation.cardProvider', {
                name: providerName,
                count: node.count,
              })
            : translate(locale, 'generation.cardProviderMissing')}
        </span>
        {status ? (
          <span className="generation-card-editor__status" role="status" title={status}>
            {status}
          </span>
        ) : null}
      </div>
      <button
        type="button"
        className="generation-card-editor__run"
        disabled={busy || node.locked}
        title={
          ready
            ? `${providerName ?? ''} · ${node.count}`
            : translate(locale, 'generation.providerRequired')
        }
        onClick={() => {
          commit();
          onRun(draft);
        }}
      >
        {translate(
          locale,
          busy ? 'generation.running' : ready ? 'generation.run' : 'generation.configure',
        )}
        {ready && !busy ? ` · ${node.count}` : ''}
      </button>
    </div>
  );
}
