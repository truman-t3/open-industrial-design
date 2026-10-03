import { useState } from 'react';
import type {
  Asset,
  Design,
  GenerationCandidate,
  GenerationNode,
  Model3DNode,
} from '@open-industrial-design/design-model';
import type { ProviderConfig } from '@open-industrial-design/ai-core';
import type { CanvasNode } from '@open-industrial-design/canvas';
import {
  translateDemoLabel,
  translateDesignKind,
  translateDesignStatus,
  translateNodeType,
} from '@open-industrial-design/core';
import { useLocalization } from '@open-industrial-design/ui';
import { UiIcon, type UiIconName } from './ui-icons';
import { generationTools, generationViews } from './generation-tools';
import { CandidateReview } from './candidate-review';
import { RegionEditor } from './region-editor';

export interface WorkspaceInspectorProps {
  exploration?: { busy: boolean; status?: string; onChoose(toolId: string): void };
  activeModelAsset?: Asset;
  generation?: {
    node: GenerationNode;
    candidates: GenerationCandidate[];
    selectedCandidateId?: string;
    previewUrls: Record<string, string>;
    inputCount: number;
    signature: string;
    inputs: Array<{
      id: string;
      sourceNodeId: string;
      sourceAssetId: string;
      label: string;
      role: 'base' | 'reference';
      previewUrl?: string;
    }>;
    providers: ProviderConfig[];
    selectedProviderId: string;
    readiness: string;
    busy: boolean;
    busyCandidateId?: string;
    status?: string;
    onUpdate(patch: Partial<GenerationNode>): void;
    onProviderChange(id: string): void;
    onProviderSettings(): void;
    onDisconnect(id: string): void;
    onRun(): void;
    onCancel?(): void;
    onKeep(id: string, destination: 'design' | 'reference'): void;
    onDiscard(id: string): void;
    onSelectGeneration?(): void;
  };
  node?: CanvasNode;
  onOpenAi(): void;
  selectedDesign?: Design;
  designs?: Design[];
  workspace: 'canvas' | 'graph' | 'viewer';
}

function DetailSection({
  children,
  open = false,
  title,
}: {
  children: React.ReactNode;
  open?: boolean;
  title: string;
}) {
  return (
    <details className="inspector-section" open={open}>
      <summary>{title}</summary>
      <div>{children}</div>
    </details>
  );
}

function nodeIcon(type?: CanvasNode['type']): UiIconName {
  if (type === 'reference' || type === 'image') return 'image';
  if (type === 'sketch') return 'sketch';
  if (type === 'concept' || type === 'variant' || type === 'model3d') return 'box';
  if (type === 'text') return 'text';
  return 'sliders';
}

export function WorkspaceInspector({
  exploration,
  activeModelAsset,
  generation,
  node,
  onOpenAi,
  selectedDesign,
  designs,
  workspace,
}: WorkspaceInspectorProps) {
  const { locale, t } = useLocalization();
  // Present the same input order as the generation Action without mutating props.
  const orderedInputs = [...(generation?.inputs ?? [])].sort((a, b) =>
    a.role === b.role ? a.id.localeCompare(b.id) : a.role === 'base' ? -1 : 1,
  );
  const parentDesign = designs?.find((design) => design.id === selectedDesign?.parentDesignId);
  const [review, setReview] = useState<{ nodeId: string; candidateId: string }>();
  const activeTool = generation
    ? generationTools.find((tool) =>
        generation.node.localEdit
          ? tool.id === 'local'
          : generation.node.requestedViews
            ? tool.id === 'view'
            : generation.node.direction.startsWith(t(tool.prompt)),
      )
    : undefined;
  const mainInput = generation?.inputs.find((input) => input.role === 'base');
  const validRegion =
    generation?.node.editRegion?.sourceNodeId === mainInput?.sourceNodeId &&
    generation?.node.editRegion?.sourceAssetId === mainInput?.sourceAssetId
      ? generation?.node.editRegion
      : undefined;
  const maskSupported =
    generation?.providers.find((item) => item.id === generation.selectedProviderId)
      ?.supportsMask === true;
  const modelNode = node?.type === 'model3d' ? (node as CanvasNode & Model3DNode) : undefined;
  const selectedCandidate = generation?.candidates.find(
    (candidate) => candidate.id === generation.selectedCandidateId,
  );
  if (generation && selectedCandidate) {
    const index = generation.candidates.findIndex(
      (candidate) => candidate.id === selectedCandidate.id,
    );
    const label = t('generation.candidateNumber', { number: index + 1 });
    const busy = Boolean(generation.busyCandidateId);
    return (
      <aside aria-label={t('inspector.title')} className="inspector">
        <header className="inspector__header">
          <div className="inspector__identity">
            <span aria-hidden="true" className="inspector__type-badge">
              <UiIcon name="image" size={16} />
            </span>
            <div>
              <span>{t('generation.resultSelection')}</span>
              <h1>{label}</h1>
            </div>
          </div>
        </header>
        <section className="inspector-generation" aria-label={label}>
          {generation.status ? <p role="status">{generation.status}</p> : null}
          <button
            type="button"
            disabled={!generation.onSelectGeneration}
            onClick={generation.onSelectGeneration}
          >
            {t('generation.openStep')}
          </button>
          <article className="inspector-generation__candidate is-selected">
            {generation.previewUrls[selectedCandidate.id] ? (
              <button
                type="button"
                aria-label={t('generation.viewCandidate')}
                onClick={() =>
                  setReview({ nodeId: generation.node.id, candidateId: selectedCandidate.id })
                }
              >
                <img alt={label} src={generation.previewUrls[selectedCandidate.id]} />
              </button>
            ) : (
              <p>{t('generation.previewUnavailable')}</p>
            )}
            {selectedCandidate.view ? (
              <strong>{t(`generation.view.${selectedCandidate.view}`)}</strong>
            ) : null}
            {selectedCandidate.inputSignature !== generation.signature ? (
              <small>{t('generation.stale')}</small>
            ) : null}
            <button
              type="button"
              onClick={() =>
                setReview({ nodeId: generation.node.id, candidateId: selectedCandidate.id })
              }
            >
              {t('generation.compare')}
            </button>
            <div>
              <button
                type="button"
                disabled={busy}
                onClick={() => generation.onKeep(selectedCandidate.id, 'design')}
              >
                {t('generation.keepDesign')}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => generation.onKeep(selectedCandidate.id, 'reference')}
              >
                {t('generation.keepReference')}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => generation.onDiscard(selectedCandidate.id)}
              >
                {t('common.discard')}
              </button>
            </div>
          </article>
          <DetailSection title={t('generation.stepSource')}>
            <p>{generation.node.direction}</p>
          </DetailSection>
          {exploration ? (
            <DetailSection open title={t('generation.continueExploration')}>
              <p>{t('generation.manualStepHint')}</p>
              <div className="inspector-generation__candidate-actions">
                {generationTools
                  .filter((tool) => ['sketch', 'form', 'cmf', 'scene', 'local'].includes(tool.id))
                  .map((tool) => (
                    <button
                      type="button"
                      key={tool.id}
                      disabled={exploration.busy || busy}
                      onClick={() => exploration.onChoose(tool.id)}
                    >
                      {t(tool.label)}
                    </button>
                  ))}
              </div>
            </DetailSection>
          ) : null}
          {review?.nodeId === generation.node.id &&
          generation.candidates.some((candidate) => candidate.id === review.candidateId) ? (
            <CandidateReview
              key={review.candidateId}
              generation={generation}
              initialId={review.candidateId}
              onClose={() => setReview(undefined)}
            />
          ) : null}
        </section>
      </aside>
    );
  }
  const title =
    (node?.type === 'generation' ? node.label : undefined) ??
    (selectedDesign ? translateDemoLabel(locale, selectedDesign.name) : undefined) ??
    (node && 'label' in node && node.label?.trim()
      ? translateDemoLabel(locale, node.label)
      : undefined) ??
    (node?.type ? translateNodeType(locale, node.type) : t('inspector.title'));
  return (
    <aside aria-label={t('inspector.title')} className="inspector">
      <header className="inspector__header">
        <div className="inspector__identity">
          <span aria-hidden="true" className="inspector__type-badge">
            <UiIcon name={nodeIcon(node?.type)} size={16} />
          </span>
          <div>
            <span>
              {workspace === 'graph'
                ? t('inspector.lineage')
                : workspace === 'viewer'
                  ? t('inspector.review3d')
                  : t('inspector.selection')}
            </span>
            <h1>{title}</h1>
          </div>
        </div>
      </header>
      {!node && !selectedDesign ? (
        <div className="inspector__empty">
          <strong>{t('inspector.noneTitle')}</strong>
          <p>{t('inspector.noneDescription')}</p>
        </div>
      ) : null}
      {generation ? (
        <section className="inspector-generation" aria-label={t('node.generation')}>
          <p className="inspector-generation__hint">{t('generation.selectSource')}</p>
          <div className="inspector-generation__inputs">
            <strong>{t('generation.connected', { count: generation.inputCount })}</strong>
            {orderedInputs.map((input) => (
              <div className="inspector-generation__input" key={input.id}>
                {input.previewUrl ? (
                  <img alt="" src={input.previewUrl} />
                ) : (
                  <UiIcon name="image" size={20} />
                )}
                <span>
                  {input.role === 'base' ? t('generation.base') : t('generation.reference')} ·{' '}
                  {translateDemoLabel(locale, input.label)}
                </span>
                <button
                  aria-label={t('generation.disconnect', { name: input.label })}
                  onClick={() => generation.onDisconnect(input.id)}
                  type="button"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <h2>{t('generation.intent')}</h2>
          <p className="inspector-generation__hint">{t('generation.presets')}</p>
          <div
            className="inspector-generation__tools"
            role="group"
            aria-label={t('generation.tool.label')}
          >
            {generationTools.map((tool) => (
              <button
                key={tool.id}
                type="button"
                disabled={generation.busy}
                aria-pressed={activeTool?.id === tool.id}
                title={t(tool.hint)}
                onClick={() =>
                  generation.onUpdate({
                    label: t(tool.label),
                    direction: t(tool.prompt),
                    requestedViews: tool.id === 'view' ? ['perspective'] : undefined,
                    localEdit: tool.id === 'local' ? true : undefined,
                    editRegion: undefined,
                    ...(tool.id === 'view' ? { count: 1 } : {}),
                  })
                }
              >
                {t(tool.label)}
              </button>
            ))}
          </div>
          {activeTool ? <p className="inspector-generation__hint">{t(activeTool.hint)}</p> : null}
          {generation.node.localEdit ? (
            <>
              <p className="inspector-generation__hint">{t('generation.mask.protectionHint')}</p>
              {mainInput?.previewUrl && mainInput.sourceAssetId ? (
                <RegionEditor
                  key={`${generation.node.id}:${mainInput.sourceNodeId}:${mainInput.sourceAssetId}`}
                  source={{
                    sourceNodeId: mainInput.sourceNodeId,
                    sourceAssetId: mainInput.sourceAssetId,
                    previewUrl: mainInput.previewUrl,
                  }}
                  region={validRegion}
                  disabled={generation.busy}
                  onChange={(editRegion) => generation.onUpdate({ editRegion })}
                />
              ) : (
                <p>{t('generation.mask.mainRequired')}</p>
              )}
              {!maskSupported ? <p role="status">{t('generation.mask.providerRequired')}</p> : null}
            </>
          ) : null}
          {activeTool?.id === 'view' ? (
            <div
              className="inspector-generation__tools"
              role="group"
              aria-label={t('generation.view.label')}
            >
              {generationViews.map((view) => (
                <button
                  key={view}
                  type="button"
                  disabled={generation.busy}
                  aria-pressed={generation.node.requestedViews?.includes(view) ?? false}
                  onClick={() => {
                    const current = generation.node.requestedViews ?? [];
                    const next = current.includes(view)
                      ? current.filter((item) => item !== view)
                      : [...current, view];
                    if (!next.length || next.length > 4) return;
                    generation.onUpdate({ requestedViews: next, count: next.length });
                  }}
                >
                  {t(`generation.view.${view}`)}
                </button>
              ))}
            </div>
          ) : null}
          <p className="inspector-generation__hint">{t('generation.tool.limit')}</p>
          {generation.node.requestedViews ? (
            <p className="inspector-generation__notice">
              {t('generation.view.batch', { count: generation.node.requestedViews.length })}
            </p>
          ) : null}
          <details className="inspector-section">
            <summary>{t('generation.selectSource')}</summary>
            <div>
              {generationTools.map((tool) => (
                <p key={tool.id}>
                  <strong>{t(tool.label)}</strong>
                  <br />
                  {t(tool.hint)}
                </p>
              ))}
            </div>
          </details>
          <label className="inspector-generation__field">
            <span>{t('generation.direction')}</span>
            <textarea
              onChange={(event) => generation.onUpdate({ direction: event.target.value })}
              rows={3}
              value={generation.node.direction}
            />
          </label>
          <label className="inspector-generation__field">
            <span>{t('generation.notes')}</span>
            <textarea
              onChange={(event) => generation.onUpdate({ notes: event.target.value })}
              rows={3}
              value={generation.node.notes}
            />
          </label>
          <h2>{t('generation.setup')}</h2>
          <label className="inspector-generation__field">
            <span>{t('generation.count')}</span>
            <select
              disabled={Boolean(generation.node.requestedViews)}
              onChange={(event) => generation.onUpdate({ count: Number(event.target.value) })}
              value={generation.node.count}
            >
              {[1, 2, 3, 4].map((count) => (
                <option key={count} value={count}>
                  {count}
                </option>
              ))}
            </select>
          </label>
          <label className="inspector-generation__field">
            <span>{t('ai.provider')}</span>
            <select
              onChange={(event) => generation.onProviderChange(event.target.value)}
              value={generation.selectedProviderId}
            >
              <option value="">{t('ai.chooseProvider')}</option>
              {generation.providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name} · {provider.model}
                </option>
              ))}
            </select>
          </label>
          <button
            className="inspector-generation__settings"
            onClick={generation.onProviderSettings}
            type="button"
          >
            {t('ai.manageProvider')}
          </button>
          <p className="inspector-generation__hint">{t('generation.billing')}</p>
          <button
            className="button--primary inspector-generation__run"
            disabled={
              generation.busy ||
              generation.readiness !== 'ready' ||
              generation.inputCount === 0 ||
              !generation.node.direction.trim() ||
              generation.node.requestedViews?.length === 0 ||
              (generation.node.localEdit && (!validRegion || !maskSupported))
            }
            onClick={generation.onRun}
            type="button"
          >
            {generation.busy ? t('generation.running') : t('generation.run')}
          </button>
          {generation.busy && generation.onCancel ? (
            <button onClick={generation.onCancel} type="button">
              {t('generation.cancel')}
            </button>
          ) : null}
          {generation.readiness !== 'ready' ? (
            <p className="inspector-generation__notice">{t('generation.providerRequired')}</p>
          ) : null}
          {generation.status ? (
            <p className="inspector-generation__hint" role="status">
              {generation.status}
            </p>
          ) : null}
          {generation.candidates.length ? <h2>{t('generation.candidates')}</h2> : null}
          {generation.candidates.length ? (
            <p className="inspector-generation__hint">{t('generation.review')}</p>
          ) : null}
          <div className="inspector-generation__candidates">
            {generation.candidates.map((candidate, index) => (
              <article
                aria-label={t('generation.candidateNumber', { number: index + 1 })}
                aria-current={generation.selectedCandidateId === candidate.id ? 'true' : undefined}
                className={
                  generation.selectedCandidateId === candidate.id
                    ? 'inspector-generation__candidate is-selected'
                    : 'inspector-generation__candidate'
                }
                key={candidate.id}
              >
                <strong>{t('generation.candidateNumber', { number: index + 1 })}</strong>
                {candidate.view ? <strong>{t(`generation.view.${candidate.view}`)}</strong> : null}
                {generation.selectedCandidateId === candidate.id ? (
                  <strong className="inspector-generation__selected-label">
                    {t('generation.selectedOnCanvas')}
                  </strong>
                ) : null}
                {generation.previewUrls[candidate.id] ? (
                  <button
                    type="button"
                    onClick={() =>
                      setReview({ nodeId: generation.node.id, candidateId: candidate.id })
                    }
                    aria-label={`${t('generation.viewCandidate')} · ${t('generation.candidateNumber', { number: index + 1 })}`}
                  >
                    <img
                      alt={t('generation.candidateNumber', { number: index + 1 })}
                      src={generation.previewUrls[candidate.id]}
                    />
                  </button>
                ) : (
                  <p>{t('generation.previewUnavailable')}</p>
                )}
                {candidate.inputSignature !== generation.signature ? (
                  <small>{t('generation.stale')}</small>
                ) : null}
                <div>
                  <button
                    disabled={Boolean(generation.busyCandidateId)}
                    onClick={() => generation.onKeep(candidate.id, 'design')}
                    type="button"
                  >
                    {t('generation.keepDesign')}
                  </button>
                  <button
                    disabled={Boolean(generation.busyCandidateId)}
                    onClick={() => generation.onKeep(candidate.id, 'reference')}
                    type="button"
                  >
                    {t('generation.keepReference')}
                  </button>
                  <button
                    disabled={Boolean(generation.busyCandidateId)}
                    onClick={() => generation.onDiscard(candidate.id)}
                    type="button"
                  >
                    {t('common.discard')}
                  </button>
                </div>
              </article>
            ))}
          </div>
          {review?.nodeId === generation.node.id && generation.candidates.length ? (
            <CandidateReview
              key={review.candidateId}
              generation={generation}
              initialId={review.candidateId}
              onClose={() => setReview(undefined)}
            />
          ) : null}
        </section>
      ) : null}
      {exploration ? (
        <DetailSection open title={t('generation.continueExploration')}>
          <p>{t('generation.manualStepHint')}</p>
          <div className="inspector-generation__candidate-actions">
            {generationTools
              .filter((tool) => ['sketch', 'form', 'cmf', 'scene', 'local'].includes(tool.id))
              .map((tool) => (
                <button
                  type="button"
                  key={tool.id}
                  disabled={exploration.busy}
                  onClick={() => exploration.onChoose(tool.id)}
                >
                  {t(tool.label)}
                </button>
              ))}
          </div>
          {exploration.status ? <p role="status">{exploration.status}</p> : null}
        </DetailSection>
      ) : null}
      {node ? (
        <DetailSection open title={t('inspector.basic')}>
          <dl>
            <div>
              <dt>{t('inspector.type')}</dt>
              <dd>{translateNodeType(locale, node.type)}</dd>
            </div>
            <div>
              <dt>{t('inspector.position')}</dt>
              <dd>
                {Math.round(node.x)}, {Math.round(node.y)}
              </dd>
            </div>
            <div>
              <dt>{t('inspector.size')}</dt>
              <dd>
                {Math.round(node.width)} × {Math.round(node.height)}
              </dd>
            </div>
          </dl>
        </DetailSection>
      ) : null}
      {selectedDesign ? (
        <>
          <DetailSection open title={t('inspector.design')}>
            <dl>
              <div>
                <dt>{t('inspector.kind')}</dt>
                <dd>{translateDesignKind(locale, selectedDesign.kind)}</dd>
              </div>
              <div>
                <dt>{t('inspector.decision')}</dt>
                <dd className="inspector__status-chip">
                  {selectedDesign.status === 'approved'
                    ? t('inspector.approved')
                    : translateDesignStatus(locale, selectedDesign.status)}
                </dd>
              </div>
              {selectedDesign.parentDesignId ? (
                <div>
                  <dt>{t('inspector.lineageField')}</dt>
                  <dd>
                    {t('inspector.variantOf', {
                      name: parentDesign?.name
                        ? translateDemoLabel(locale, parentDesign.name)
                        : t('inspector.missingParent'),
                    })}
                  </dd>
                </div>
              ) : null}
            </dl>
            {selectedDesign.status === 'approved' ? (
              <p className="inspector__ready">{t('inspector.readyCad')}</p>
            ) : null}
          </DetailSection>
          {selectedDesign.dna ? (
            <DetailSection title={t('inspector.dna')}>
              <ul className="inspector__dna">
                {Object.entries(selectedDesign.dna)
                  .filter(([key]) => key !== 'notes')
                  .map(([key, locked]) => (
                    <li key={key}>
                      {locked ? t('inspector.locked') : t('inspector.open')} ·{' '}
                      {key.replace('Locked', '')}
                    </li>
                  ))}
              </ul>
              {selectedDesign.dna.notes?.length ? (
                <p>{selectedDesign.dna.notes.join(' ')}</p>
              ) : null}
            </DetailSection>
          ) : null}
          <DetailSection title={t('inspector.aiActions')}>
            <p>{t('inspector.aiDescription')}</p>
            <button onClick={onOpenAi} type="button">
              {t('inspector.openAi')}
            </button>
          </DetailSection>
        </>
      ) : null}
      {node?.type === 'cmf' ? (
        <DetailSection title={t('inspector.cmf')}>
          <p>{t('inspector.cmfDescription')}</p>
        </DetailSection>
      ) : null}
      {modelNode ? (
        <DetailSection open title={t('inspector.view3d')}>
          <dl>
            <div>
              <dt>{t('inspector.preview')}</dt>
              <dd>
                {modelNode.previewAssetId ? t('inspector.captured') : t('inspector.noCapture')}
              </dd>
            </div>
            <div>
              <dt>{t('inspector.view')}</dt>
              <dd>{modelNode.camera?.preset ?? t('threeD.perspective')}</dd>
            </div>
            {activeModelAsset ? (
              <div>
                <dt>{t('inspector.model')}</dt>
                <dd>{activeModelAsset.name}</dd>
              </div>
            ) : null}
          </dl>
        </DetailSection>
      ) : null}
    </aside>
  );
}
