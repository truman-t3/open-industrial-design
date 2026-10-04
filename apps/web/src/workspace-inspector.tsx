import { useRef, useState } from 'react';
import type {
  Asset,
  Design,
  DesignStatus,
  ViewSet,
  CMFSet,
  CMFVariant,
  CMFVariantDraft,
  GenerationCandidate,
  GenerationNode,
  Model3DNode,
  TextNode,
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
import { continuationToolGroups, generationTools, generationViews } from './generation-tools';
import { CandidateReview } from './candidate-review';
import { PromptLibrary } from './prompt-library';
import { RegionEditor } from './region-editor';
import { PatternEditor } from './pattern-editor';
import {
  defaultPatternPlacement,
  designViewTypes,
  nextDesignStatuses,
} from '@open-industrial-design/design-model';
import { designDnaKeys } from '@open-industrial-design/actions';

function TextNoteEditor({
  node,
  busy,
  onSave,
}: {
  node: TextNode;
  busy: boolean;
  onSave: NonNullable<WorkspaceInspectorProps['onSaveText']>;
}) {
  const { t } = useLocalization();
  const [text, setText] = useState(node.text);
  const [fontSizeInput, setFontSizeInput] = useState(String(node.fontSize ?? 20));
  const fontSize = Number(fontSizeInput);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  return (
    <form
      className="inspector-dna-editor"
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy || saving || node.locked) return;
        setSaving(true);
        setFailed(false);
        try {
          await onSave(node.id, text, fontSize);
        } catch {
          setFailed(true);
        } finally {
          setSaving(false);
        }
      }}
    >
      <label className="inspector-generation__field">
        {t('text.content')}
        <textarea
          aria-label={t('text.content')}
          rows={6}
          maxLength={8000}
          value={text}
          disabled={busy || saving || node.locked}
          onChange={(event) => setText(event.target.value)}
        />
      </label>
      <label className="inspector-generation__field">
        {t('text.fontSize')}
        <input
          aria-label={t('text.fontSize')}
          type="number"
          min={12}
          max={72}
          value={fontSizeInput}
          disabled={busy || saving || node.locked}
          onChange={(event) => setFontSizeInput(event.target.value)}
        />
      </label>
      <p>{t('text.hint')}</p>
      <button
        type="submit"
        disabled={
          busy ||
          saving ||
          node.locked ||
          !text.trim() ||
          !Number.isFinite(fontSize) ||
          fontSize < 12 ||
          fontSize > 72 ||
          (text === node.text && fontSize === (node.fontSize ?? 20))
        }
      >
        {t('text.save')}
      </button>
      {failed ? <p role="alert">{t('text.failed')}</p> : null}
    </form>
  );
}

function DesignDecisionEditor({
  design,
  busy,
  onSave,
}: {
  design: Design;
  busy: boolean;
  onSave: NonNullable<WorkspaceInspectorProps['onSaveDecision']>;
}) {
  const { t, locale } = useLocalization();
  const [status, setStatus] = useState<DesignStatus>(design.status);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);
  const options = nextDesignStatuses(design.status);
  if (!options.length) return <p>{t('decision.archived')}</p>;
  return (
    <form
      className="inspector-dna-editor"
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy || lock.current || status === design.status) return;
        if (status === 'archived' && !window.confirm(t('decision.archiveConfirm'))) return;
        lock.current = true;
        setSaving(true);
        setFailed(false);
        try {
          await onSave(design.id, design.status, status);
        } catch {
          setFailed(true);
        } finally {
          lock.current = false;
          setSaving(false);
        }
      }}
    >
      <label className="inspector-generation__field">
        {t('decision.next')}
        <select
          aria-label={t('decision.next')}
          value={status}
          disabled={busy || saving}
          onChange={(event) => {
            setStatus(event.target.value as DesignStatus);
            setFailed(false);
          }}
        >
          {[design.status, ...options].map((value) => (
            <option key={value} value={value}>
              {translateDesignStatus(locale, value)}
            </option>
          ))}
        </select>
      </label>
      <p>{t('decision.hint')}</p>
      <button type="submit" disabled={busy || saving || status === design.status}>
        {t('decision.save')}
      </button>
      {failed ? <p role="alert">{t('decision.failed')}</p> : null}
    </form>
  );
}

function ManualDesignEditor({
  sourceId,
  concept = false,
  busy,
  onCreate,
}: {
  sourceId: string;
  concept?: boolean;
  busy: boolean;
  onCreate: NonNullable<WorkspaceInspectorProps['onCreateVariant']>;
}) {
  const { t } = useLocalization();
  const [name, setName] = useState('');
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);
  return (
    <form
      className="inspector-dna-editor"
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy || lock.current || !name.trim()) return;
        lock.current = true;
        setSaving(true);
        setFailed(false);
        try {
          await onCreate(sourceId, name.trim());
        } catch {
          setFailed(true);
        } finally {
          lock.current = false;
          setSaving(false);
        }
      }}
    >
      <p>{t(concept ? 'design.manualConceptHint' : 'design.manualVariantHint')}</p>
      <label className="inspector-generation__field">
        {t(concept ? 'design.conceptName' : 'design.variantName')}
        <input
          value={name}
          maxLength={200}
          disabled={busy || saving}
          onChange={(event) => {
            setName(event.target.value);
            setFailed(false);
          }}
        />
      </label>
      <button type="submit" disabled={busy || saving || !name.trim()}>
        {t(concept ? 'design.createConcept' : 'design.createVariant')}
      </button>
      {failed ? (
        <p role="alert">{t(concept ? 'design.conceptFailed' : 'design.variantFailed')}</p>
      ) : null}
    </form>
  );
}

function DesignDnaEditor({
  design,
  busy,
  onSave,
}: {
  design: Design;
  busy: boolean;
  onSave?: (id: string, dna: NonNullable<Design['dna']>) => Promise<void>;
}) {
  const { t } = useLocalization();
  const [dna, setDna] = useState(() => ({
    silhouetteLocked: false,
    proportionLocked: false,
    geometryLocked: false,
    detailLocked: false,
    cmfLocked: false,
    brandLocked: false,
    ...design.dna,
  }));
  const [notes, setNotes] = useState(() => (design.dna?.notes ?? []).join('\n'));
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [status, setStatus] = useState<'saved' | 'failed'>();
  const valid = notes.length <= 4000 && notes.split('\n').length <= 40;
  const disabled = busy || saving || !onSave;
  return (
    <form
      className="inspector-dna-editor"
      onSubmit={async (event) => {
        event.preventDefault();
        if (disabled || !valid || savingRef.current) return;
        savingRef.current = true;
        setSaving(true);
        setStatus(undefined);
        try {
          await onSave!(design.id, {
            ...dna,
            notes: notes
              .split('\n')
              .map((note) => note.trim())
              .filter(Boolean),
          });
          setStatus('saved');
        } catch {
          setStatus('failed');
        } finally {
          savingRef.current = false;
          setSaving(false);
        }
      }}
    >
      <p>{t('dna.hint')}</p>
      <fieldset disabled={disabled}>
        {designDnaKeys.map((key) => (
          <label key={key}>
            <input
              type="checkbox"
              checked={dna[key]}
              onChange={(event) => {
                setDna((current) => ({ ...current, [key]: event.target.checked }));
                setStatus(undefined);
              }}
            />
            {t(`dna.${key}`)}
          </label>
        ))}
        <label className="inspector-generation__field">
          {t('dna.notes')}
          <textarea
            value={notes}
            maxLength={4000}
            rows={4}
            onChange={(event) => {
              setNotes(event.target.value);
              setStatus(undefined);
            }}
          />
        </label>
      </fieldset>
      {!valid ? <p role="alert">{t('dna.limit')}</p> : null}
      <button type="submit" disabled={disabled || !valid}>
        {t('dna.save')}
      </button>
      {status ? <p role={status === 'failed' ? 'alert' : 'status'}>{t(`dna.${status}`)}</p> : null}
    </form>
  );
}

function ManualCMFPanel({
  designId,
  initialId,
  data,
  busy,
}: {
  designId: string;
  initialId?: string;
  data: NonNullable<WorkspaceInspectorProps['manualCMF']>;
  busy: boolean;
}) {
  const { t } = useLocalization();
  const sets = data.sets.filter((set) => set.designId === designId);
  const [id, setId] = useState(initialId ?? sets[0]?.id ?? '');
  return (
    <>
      <label className="inspector-generation__field">
        {t('cmf.choose')}
        <select
          aria-label={t('cmf.choose')}
          disabled={busy}
          value={id}
          onChange={(e) => setId(e.target.value)}
        >
          <option value="">{t('cmf.new')}</option>
          {sets.map((set) => (
            <option key={set.id} value={set.id}>
              {set.name ?? 'CMF'}
            </option>
          ))}
        </select>
      </label>
      <ManualCMFEditor
        key={id || 'new'}
        designId={designId}
        record={sets.find((set) => set.id === id)}
        data={data}
        busy={busy}
      />
    </>
  );
}

function ManualCMFEditor({
  designId,
  record,
  data,
  busy,
}: {
  designId: string;
  record?: CMFSet;
  data: NonNullable<WorkspaceInspectorProps['manualCMF']>;
  busy: boolean;
}) {
  const { t } = useLocalization();
  const [name, setName] = useState(record?.name ?? t('cmf.title'));
  const [drafts, setDrafts] = useState<Array<{ key: string; value: CMFVariantDraft }>>(() =>
    record
      ? record.variantIds.flatMap((id) => {
          const v = data.variants.find((item) => item.id === id);
          return v
            ? [
                {
                  key: id,
                  value: {
                    id,
                    name: v.name,
                    color: v.color ? { ...v.color } : undefined,
                    material: v.material,
                    finish: v.finish,
                    notes: v.notes,
                    textureAssetId: v.textureAssetId,
                  },
                },
              ]
            : [];
        })
      : [{ key: crypto.randomUUID(), value: { name: '' } }],
  );
  const [status, setStatus] = useState<'saved' | 'failed'>();
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);
  const images = [...new Map(data.images.map((image) => [image.id, image])).values()];
  const update = (key: string, patch: Partial<CMFVariantDraft>) => {
    setDrafts((items) =>
      items.map((item) =>
        item.key === key ? { ...item, value: { ...item.value, ...patch } } : item,
      ),
    );
    setStatus(undefined);
  };
  return (
    <form
      className="inspector-dna-editor"
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy || lock.current || !name.trim() || !drafts.length) return;
        lock.current = true;
        setSaving(true);
        setStatus(undefined);
        try {
          await data.onSave(
            designId,
            record?.id,
            name,
            drafts.map((item) => item.value),
            (event.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'place',
          );
          setStatus('saved');
        } catch {
          setStatus('failed');
        } finally {
          lock.current = false;
          setSaving(false);
        }
      }}
    >
      <p>{t('cmf.hint')}</p>
      <fieldset disabled={busy || saving}>
        <label className="inspector-generation__field">
          {t('cmf.name')}
          <input
            value={name}
            maxLength={200}
            onChange={(e) => {
              setName(e.target.value);
              setStatus(undefined);
            }}
          />
        </label>
        {drafts.map(({ key, value }, index) => (
          <fieldset key={key} className="manual-cmf-alternative">
            <legend>
              {t('cmf.alternative')} {index + 1}
            </legend>
            {(['name', 'material', 'finish', 'notes'] as const).map((field) => (
              <label className="inspector-generation__field" key={field}>
                {t(`cmf.${field}`)}
                <input
                  value={value[field] ?? ''}
                  maxLength={field === 'notes' ? 4000 : field === 'name' ? 200 : 500}
                  onChange={(e) => update(key, { [field]: e.target.value })}
                />
              </label>
            ))}
            <label className="inspector-generation__field">
              {t('cmf.colorName')}
              <input
                value={value.color?.name ?? ''}
                maxLength={200}
                onChange={(e) => update(key, { color: { ...value.color, name: e.target.value } })}
              />
            </label>
            <label className="inspector-generation__field">
              {t('cmf.hex')}
              <input
                placeholder="#EDE9DF"
                pattern="#[0-9A-Fa-f]{6}"
                value={value.color?.hex ?? ''}
                onChange={(e) => {
                  const color = { ...value.color };
                  if (e.target.value) color.hex = e.target.value;
                  else delete color.hex;
                  update(key, { color });
                }}
              />
            </label>
            <label className="inspector-generation__field">
              {t('cmf.texture')}
              <select
                aria-label={`${t('cmf.texture')} ${index + 1}`}
                value={value.textureAssetId ?? ''}
                onChange={(e) => update(key, { textureAssetId: e.target.value || undefined })}
              >
                <option value="">{t('views.empty')}</option>
                {value.textureAssetId &&
                !images.some((image) => image.id === value.textureAssetId) ? (
                  <option value={value.textureAssetId}>{t('views.retained')}</option>
                ) : null}
                {images.map((image) => (
                  <option key={image.id} value={image.id}>
                    {image.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={drafts.length <= 1}
              onClick={() => {
                setDrafts((items) => items.filter((item) => item.key !== key));
                setStatus(undefined);
              }}
            >
              {t('cmf.remove')}
            </button>
          </fieldset>
        ))}
        <button
          type="button"
          disabled={drafts.length >= 24}
          onClick={() => {
            setDrafts((items) => [...items, { key: crypto.randomUUID(), value: { name: '' } }]);
            setStatus(undefined);
          }}
        >
          {t('cmf.add')}
        </button>
      </fieldset>
      <button type="submit" disabled={busy || saving || !name.trim() || !drafts.length}>
        {t('cmf.save')}
      </button>
      {record && !data.placedIds.includes(record.id) ? (
        <button type="submit" value="place" disabled={busy || saving || !name.trim()}>
          {t('views.place')}
        </button>
      ) : null}
      {status ? <p role={status === 'failed' ? 'alert' : 'status'}>{t(`cmf.${status}`)}</p> : null}
    </form>
  );
}

function ManualViewPanel({
  designId,
  initialId,
  data,
  busy,
}: {
  designId: string;
  initialId?: string;
  data: NonNullable<WorkspaceInspectorProps['manualViews']>;
  busy: boolean;
}) {
  const { t } = useLocalization();
  const sets = data.sets.filter((set) => set.designId === designId);
  const [id, setId] = useState(initialId ?? sets[0]?.id ?? '');
  return (
    <>
      <label className="inspector-generation__field">
        {t('views.choose')}
        <select
          aria-label={t('views.choose')}
          value={id}
          disabled={busy}
          onChange={(event) => setId(event.target.value)}
        >
          <option value="">{t('views.new')}</option>
          {sets.map((set) => (
            <option key={set.id} value={set.id}>
              {set.name ?? t('views.title')}
            </option>
          ))}
        </select>
      </label>
      <ManualViewEditor
        key={id || 'new'}
        designId={designId}
        record={sets.find((set) => set.id === id)}
        data={data}
        busy={busy}
      />
    </>
  );
}

function ManualViewEditor({
  designId,
  record,
  data,
  busy,
}: {
  designId: string;
  record?: ViewSet;
  data: NonNullable<WorkspaceInspectorProps['manualViews']>;
  busy: boolean;
}) {
  const { t } = useLocalization();
  const [views, setViews] = useState(() => ({ ...record?.views }));
  const [name, setName] = useState(record?.name ?? t('views.title'));
  const [status, setStatus] = useState<'saved' | 'failed'>();
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);
  const images = [...new Map(data.images.map((image) => [image.id, image])).values()];
  return (
    <form
      className="inspector-dna-editor"
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy || lock.current || !name.trim()) return;
        lock.current = true;
        setSaving(true);
        setStatus(undefined);
        try {
          const placeOnBoard =
            (event.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'place';
          await data.onSave(designId, record?.id, name, views, placeOnBoard);
          setStatus('saved');
        } catch {
          setStatus('failed');
        } finally {
          lock.current = false;
          setSaving(false);
        }
      }}
    >
      <p>{t('views.hint')}</p>
      <fieldset disabled={busy || saving}>
        <label className="inspector-generation__field">
          {t('views.name')}
          <input
            value={name}
            maxLength={200}
            onChange={(event) => {
              setName(event.target.value);
              setStatus(undefined);
            }}
          />
        </label>
        {designViewTypes.map((view) => (
          <label className="inspector-generation__field" key={view}>
            {t(`views.${view}`)}
            {views[view] && data.previewUrls[views[view]] ? (
              <img
                className="manual-view-preview"
                src={data.previewUrls[views[view]]}
                alt={t(`views.${view}`)}
              />
            ) : null}
            <select
              aria-label={t(`views.${view}`)}
              value={views[view] ?? ''}
              onChange={(event) => {
                const next = { ...views };
                if (event.target.value) next[view] = event.target.value;
                else delete next[view];
                setViews(next);
                setStatus(undefined);
              }}
            >
              <option value="">{t('views.empty')}</option>
              {views[view] && !images.some((image) => image.id === views[view]) ? (
                <option value={views[view]}>{t('views.retained')}</option>
              ) : null}
              {images.map((image) => (
                <option key={image.id} value={image.id}>
                  {image.name}
                </option>
              ))}
            </select>
          </label>
        ))}
      </fieldset>
      <button type="submit" disabled={busy || saving || !name.trim()}>
        {t('views.save')}
      </button>
      {record && !data.placedIds?.includes(record.id) ? (
        <button type="submit" value="place" disabled={busy || saving || !name.trim()}>
          {t('views.place')}
        </button>
      ) : null}
      {status ? (
        <p role={status === 'failed' ? 'alert' : 'status'}>{t(`views.${status}`)}</p>
      ) : null}
    </form>
  );
}

function ExplorationToolButtons({ busy, onChoose }: { busy: boolean; onChoose(id: string): void }) {
  const { t } = useLocalization();
  const buttons = (tools: (typeof continuationToolGroups)[number]) => (
    <div className="inspector-generation__candidate-actions">
      {tools.map((tool) => (
        <button
          key={tool.id}
          type="button"
          title={t(tool.hint)}
          disabled={busy}
          onClick={() => onChoose(tool.id)}
        >
          {t(tool.label)}
        </button>
      ))}
    </div>
  );
  return (
    <>
      {buttons(continuationToolGroups[0])}
      <details>
        <summary>{t('generation.moreTools')}</summary>
        {buttons(continuationToolGroups[1])}
      </details>
    </>
  );
}

export interface WorkspaceInspectorProps {
  onEditSketch?(): void;
  onSaveDecision?(
    designId: string,
    expectedStatus: DesignStatus,
    status: DesignStatus,
  ): Promise<void>;
  onCreateConcept?(sourceNodeId: string, name: string): Promise<void>;
  onCreateVariant?(designId: string, name: string): Promise<void>;
  manualCMF?: {
    sets: CMFSet[];
    variants: CMFVariant[];
    placedIds: string[];
    images: Array<{ id: string; name: string }>;
    onSave(
      designId: string,
      id: string | undefined,
      name: string,
      variants: CMFVariantDraft[],
      placeOnBoard?: boolean,
    ): Promise<void>;
  };
  manualViews?: {
    placedIds?: string[];
    sets: ViewSet[];
    images: Array<{ id: string; name: string }>;
    previewUrls: Record<string, string>;
    onSave(
      designId: string,
      id: string | undefined,
      name: string,
      views: ViewSet['views'],
      placeOnBoard?: boolean,
    ): Promise<void>;
  };
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
  onRenameGroup?(id: string, label: string): void;
  onSaveText?(id: string, text: string, fontSize: number): Promise<void>;
  onOpenAi(): void;
  selectedDesign?: Design;
  onSaveDna?(id: string, dna: NonNullable<Design['dna']>): Promise<void>;
  dnaBusy?: boolean;
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
  manualViews,
  manualCMF,
  onCreateVariant,
  onCreateConcept,
  onSaveDecision,
  onEditSketch,
  exploration,
  activeModelAsset,
  generation,
  node,
  onRenameGroup,
  onSaveText,
  onOpenAi,
  selectedDesign,
  onSaveDna,
  dnaBusy = false,
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
  const [toolPickerNodeId, setToolPickerNodeId] = useState<string>();
  const toolPickerButton = useRef<HTMLButtonElement>(null);
  const toolPickerOpen = Boolean(generation && toolPickerNodeId === generation.node.id);
  const activeTool = generation
    ? generationTools.find((tool) =>
        generation.node.patternTask
          ? tool.id === `pattern-${generation.node.patternTask.kind}`
          : generation.node.textOnly
            ? tool.id === 'text'
            : generation.node.patternPlacement
              ? tool.id === 'pattern'
              : generation.node.removeBackground
                ? tool.id === 'cutout'
                : generation.node.localEdit
                  ? tool.id ===
                    (generation.node.localCmf
                      ? 'local-cmf'
                      : generation.node.localEditMode === 'erase'
                        ? 'erase'
                        : 'local')
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
              <ExplorationToolButtons
                busy={exploration.busy || busy}
                onChoose={exploration.onChoose}
              />
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
      {node?.type === 'sketch' && onEditSketch ? (
        <section className="inspector-generation">
          {'sketchDocumentId' in node &&
          typeof node.sketchDocumentId === 'string' &&
          node.sketchDocumentId ? (
            <>
              <button type="button" disabled={dnaBusy || node.locked} onClick={onEditSketch}>
                {t('sketch.edit')}
              </button>
              <p className="inspector-generation__hint">{t('sketch.sharedHint')}</p>
            </>
          ) : (
            <p className="inspector-generation__hint">{t('sketch.staticHint')}</p>
          )}
        </section>
      ) : null}
      {generation ? (
        <section className="inspector-generation" aria-label={t('node.generation')}>
          <p className="inspector-generation__hint">
            {t(generation.node.textOnly ? 'generation.tool.textHint' : 'generation.selectSource')}
          </p>
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
          <PromptLibrary
            key={generation.node.id}
            direction={generation.node.direction}
            notes={generation.node.notes}
            disabled={generation.busy}
            onApply={generation.onUpdate}
          />
          <button
            className="inspector-generation__tool-picker"
            ref={toolPickerButton}
            type="button"
            aria-label={t('generation.tool.change')}
            aria-expanded={toolPickerOpen}
            aria-controls="generation-tool-picker"
            disabled={generation.busy}
            onClick={() => setToolPickerNodeId(toolPickerOpen ? undefined : generation.node.id)}
          >
            <strong>{activeTool ? t(activeTool.label) : t('generation.tool.custom')}</strong>
            <span>{t('generation.tool.change')}</span>
          </button>
          {toolPickerOpen ? (
            <div
              id="generation-tool-picker"
              className="inspector-generation__tools"
              role="group"
              aria-label={t('generation.tool.label')}
              onKeyDown={(event) => {
                if (event.key !== 'Escape') return;
                event.preventDefault();
                event.stopPropagation();
                setToolPickerNodeId(undefined);
                toolPickerButton.current?.focus({ preventScroll: true });
              }}
            >
              {generationTools.map((tool) => (
                <button
                  key={tool.id}
                  type="button"
                  disabled={generation.busy || (tool.id === 'text' && generation.inputCount > 0)}
                  aria-pressed={activeTool?.id === tool.id}
                  title={t(tool.hint)}
                  onClick={() => {
                    generation.onUpdate({
                      label: t(tool.label),
                      direction: t(tool.prompt),
                      textOnly:
                        tool.id === 'text' ||
                        (tool.id === 'pattern-create' && generation.inputCount === 0)
                          ? true
                          : undefined,
                      patternTask:
                        tool.id === 'pattern-create'
                          ? { kind: 'create', repeat: 'single' }
                          : tool.id === 'pattern-transfer'
                            ? { kind: 'transfer', placement: '', scale: 'medium' }
                            : undefined,
                      requestedViews: tool.id === 'view' ? ['perspective'] : undefined,
                      localEdit: ['local', 'erase', 'local-cmf'].includes(tool.id)
                        ? true
                        : undefined,
                      localCmf:
                        tool.id === 'local-cmf'
                          ? { color: '', material: '', finish: '' }
                          : undefined,
                      localEditMode: tool.id === 'erase' ? 'erase' : undefined,
                      removeBackground: tool.id === 'cutout' ? true : undefined,
                      patternPlacement:
                        tool.id === 'pattern' ? { ...defaultPatternPlacement } : undefined,
                      editRegion: undefined,
                      ...(['view', 'pattern'].includes(tool.id) ? { count: 1 } : {}),
                    });
                    setToolPickerNodeId(undefined);
                    toolPickerButton.current?.focus({ preventScroll: true });
                  }}
                >
                  {t(tool.label)}
                </button>
              ))}
            </div>
          ) : null}
          {activeTool ? <p className="inspector-generation__hint">{t(activeTool.hint)}</p> : null}
          {generation.inputCount > 0 &&
          (toolPickerOpen || generation.node.patternTask?.kind === 'create') ? (
            <p className="inspector-generation__hint">{t('generation.text.disconnect')}</p>
          ) : null}
          {generation.node.patternPlacement ? (
            <PatternEditor
              base={mainInput?.previewUrl}
              pattern={orderedInputs.find((item) => item.role === 'reference')?.previewUrl}
              value={generation.node.patternPlacement}
              disabled={generation.busy}
              onChange={(patternPlacement) => generation.onUpdate({ patternPlacement })}
            />
          ) : null}
          {generation.node.patternTask?.kind === 'create' ? (
            <>
              <label className="inspector-generation__field">
                <span>{t('generation.patternTask.input')}</span>
                <select
                  aria-label={t('generation.patternTask.input')}
                  disabled={generation.busy}
                  value={generation.node.textOnly ? 'text' : 'images'}
                  onChange={(event) =>
                    generation.onUpdate({ textOnly: event.target.value === 'text' })
                  }
                >
                  <option value="text" disabled={generation.inputCount > 0}>
                    {t('generation.patternTask.text')}
                  </option>
                  <option value="images">{t('generation.patternTask.images')}</option>
                </select>
              </label>
              <label className="inspector-generation__field">
                <span>{t('generation.patternTask.repeat')}</span>
                <select
                  aria-label={t('generation.patternTask.repeat')}
                  disabled={generation.busy}
                  value={generation.node.patternTask.repeat}
                  onChange={(event) =>
                    generation.onUpdate({
                      patternTask: {
                        kind: 'create',
                        repeat: event.target.value as 'single' | 'tile',
                      },
                    })
                  }
                >
                  <option value="single">{t('generation.patternTask.single')}</option>
                  <option value="tile">{t('generation.patternTask.tile')}</option>
                </select>
              </label>
            </>
          ) : generation.node.patternTask?.kind === 'transfer' ? (
            <>
              <p className="inspector-generation__hint">{t('generation.patternTask.required')}</p>
              <label className="inspector-generation__field">
                <span>{t('generation.patternTask.placement')}</span>
                <input
                  aria-label={t('generation.patternTask.placement')}
                  disabled={generation.busy}
                  maxLength={500}
                  value={generation.node.patternTask.placement}
                  onChange={(event) =>
                    generation.onUpdate({
                      patternTask: {
                        ...(generation.node.patternTask as Extract<
                          GenerationNode['patternTask'],
                          { kind: 'transfer' }
                        >),
                        placement: event.target.value,
                      },
                    })
                  }
                />
              </label>
              <label className="inspector-generation__field">
                <span>{t('generation.patternTask.scale')}</span>
                <select
                  aria-label={t('generation.patternTask.scale')}
                  disabled={generation.busy}
                  value={generation.node.patternTask.scale}
                  onChange={(event) =>
                    generation.onUpdate({
                      patternTask: {
                        ...(generation.node.patternTask as Extract<
                          GenerationNode['patternTask'],
                          { kind: 'transfer' }
                        >),
                        scale: event.target.value as 'small' | 'medium' | 'large',
                      },
                    })
                  }
                >
                  {(['small', 'medium', 'large'] as const).map((scale) => (
                    <option value={scale} key={scale}>
                      {t(`generation.patternTask.${scale}`)}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : null}
          {generation.node.removeBackground &&
          (!generation.providers.find((item) => item.id === generation.selectedProviderId)
            ?.supportsTransparency ||
            generation.inputs.length !== 1 ||
            !mainInput) ? (
            <p role="status">{t('generation.cutout.required')}</p>
          ) : null}
          {generation.node.localEdit ? (
            <>
              {generation.node.localCmf ? (
                <div className="inspector-generation__cmf">
                  {(['color', 'material', 'finish'] as const).map((field) => (
                    <label className="inspector-generation__field" key={field}>
                      <span>{t(`generation.localCmf.${field}`)}</span>
                      <input
                        aria-label={t(`generation.localCmf.${field}`)}
                        maxLength={500}
                        disabled={generation.busy}
                        value={generation.node.localCmf![field]}
                        onChange={(event) =>
                          generation.onUpdate({
                            localCmf: { ...generation.node.localCmf!, [field]: event.target.value },
                          })
                        }
                      />
                    </label>
                  ))}
                  <p className="inspector-generation__hint">
                    {t('generation.localCmf.fieldsHint')}
                  </p>
                </div>
              ) : null}
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
            <summary>{t('generation.tool.label')}</summary>
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
              aria-label={t('generation.direction')}
              onChange={(event) => generation.onUpdate({ direction: event.target.value })}
              rows={3}
              value={generation.node.direction}
            />
          </label>
          <label className="inspector-generation__field">
            <span>{t('generation.notes')}</span>
            <textarea
              aria-label={t('generation.notes')}
              onChange={(event) => generation.onUpdate({ notes: event.target.value })}
              rows={3}
              value={generation.node.notes}
            />
          </label>
          <h2>{t('generation.setup')}</h2>
          <label className="inspector-generation__field">
            <span>{t('generation.count')}</span>
            <select
              disabled={Boolean(generation.node.requestedViews || generation.node.patternPlacement)}
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
          {!generation.node.patternPlacement ? (
            <>
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
            </>
          ) : (
            <p>{t('generation.pattern.local')}</p>
          )}
          <button
            className="button--primary inspector-generation__run"
            disabled={
              generation.busy ||
              (!generation.node.patternPlacement && generation.readiness !== 'ready') ||
              (generation.node.patternPlacement &&
                (orderedInputs.length !== 2 ||
                  !mainInput ||
                  !orderedInputs.some((item) => item.role === 'reference'))) ||
              (!generation.node.textOnly && generation.inputCount === 0) ||
              (generation.node.patternTask?.kind === 'transfer' &&
                (!generation.node.patternTask.placement.trim() ||
                  orderedInputs.length !== 2 ||
                  !mainInput ||
                  !orderedInputs.some((item) => item.role === 'reference'))) ||
              !generation.node.direction.trim() ||
              generation.node.requestedViews?.length === 0 ||
              (generation.node.localCmf &&
                !Object.values(generation.node.localCmf).some((value) => value.trim())) ||
              (generation.node.removeBackground &&
                (!generation.providers.find((item) => item.id === generation.selectedProviderId)
                  ?.supportsTransparency ||
                  generation.inputs.length !== 1 ||
                  !mainInput)) ||
              (generation.node.localEdit && (!validRegion || !maskSupported))
            }
            onClick={generation.onRun}
            type="button"
          >
            {generation.busy
              ? t('generation.running')
              : generation.node.patternPlacement
                ? t('generation.pattern.run')
                : t('generation.run')}
          </button>
          {generation.busy && generation.onCancel ? (
            <button onClick={generation.onCancel} type="button">
              {t('generation.cancel')}
            </button>
          ) : null}
          {!generation.node.patternPlacement && generation.readiness !== 'ready' ? (
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
          <ExplorationToolButtons busy={exploration.busy} onChoose={exploration.onChoose} />
          {exploration.status ? <p role="status">{exploration.status}</p> : null}
        </DetailSection>
      ) : null}
      {node ? (
        <DetailSection open title={t('inspector.basic')}>
          {node.type === 'text' && onSaveText ? (
            <TextNoteEditor
              key={`${node.id}:${node.updatedAt}`}
              node={node}
              busy={dnaBusy}
              onSave={onSaveText}
            />
          ) : null}
          {node.type === 'group' ? (
            <label className="inspector-group-name">
              {t('workspace.groupName')}
              <input
                key={`${node.id}:${node.label}`}
                defaultValue={node.label}
                maxLength={80}
                disabled={node.locked || !onRenameGroup}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur();
                }}
                onBlur={(event) => {
                  const label = event.currentTarget.value.trim() || t('node.group');
                  if (label !== node.label) onRenameGroup?.(node.id, label);
                }}
              />
            </label>
          ) : null}
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
      {node && ['reference', 'image', 'sketch'].includes(node.type) && onCreateConcept ? (
        <DetailSection title={t('design.createConcept')}>
          <ManualDesignEditor
            key={node.id}
            sourceId={node.id}
            concept
            busy={dnaBusy}
            onCreate={onCreateConcept}
          />
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
            {onSaveDecision ? (
              <DesignDecisionEditor
                key={`${selectedDesign.id}:${selectedDesign.status}`}
                design={selectedDesign}
                busy={dnaBusy}
                onSave={onSaveDecision}
              />
            ) : null}
          </DetailSection>
          {onCreateVariant ? (
            <DetailSection title={t('design.createVariant')}>
              <ManualDesignEditor
                key={selectedDesign.id}
                sourceId={selectedDesign.id}
                busy={dnaBusy}
                onCreate={onCreateVariant}
              />
            </DetailSection>
          ) : null}
          <DetailSection title={t('inspector.dna')}>
            <DesignDnaEditor
              key={selectedDesign.id}
              design={selectedDesign}
              busy={dnaBusy}
              onSave={onSaveDna}
            />
          </DetailSection>
          {manualViews ? (
            <DetailSection title={t('views.title')}>
              <ManualViewPanel
                key={`${selectedDesign.id}:${node?.id ?? 'design'}`}
                designId={selectedDesign.id}
                initialId={
                  node?.type === 'viewset'
                    ? (node as CanvasNode & { viewSetId: string }).viewSetId
                    : undefined
                }
                data={manualViews}
                busy={dnaBusy}
              />
            </DetailSection>
          ) : null}
          {manualCMF ? (
            <DetailSection title={t('cmf.title')}>
              <ManualCMFPanel
                key={`${selectedDesign.id}:${node?.id ?? 'design'}`}
                designId={selectedDesign.id}
                initialId={
                  node?.type === 'cmf' && 'cmfSetId' in node ? (node.cmfSetId as string) : undefined
                }
                data={manualCMF}
                busy={dnaBusy}
              />
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
      {node?.type === 'cmf' && !manualCMF ? (
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
