import { useEffect, useRef, useState } from 'react';
import { useLocalization } from '@open-industrial-design/ui';
import type {
  Generation,
  ResearchEntry,
  ResearchLibrary,
} from '@open-industrial-design/design-model';
import type { ProviderConfig } from '@open-industrial-design/ai-core';
import type { ResearchCommand } from '@open-industrial-design/actions';
import type { LocalMaterialEntry } from '@open-industrial-design/storage';
import { AnalysisEvidence, MaterialPreview } from './material-library';

type Draft =
  | {
      kind: 'entry';
      id?: string;
      title: string;
      assetId: string;
      notes: string;
      tags: string;
      sourceUrl: string;
      brand: string;
      product: string;
      recordedOn: string;
    }
  | { kind: 'collection'; id?: string; name: string; entryIds: string[] };
export function ResearchLibraryDialog({
  load,
  save,
  loadBlob,
  onPlace,
  onImport,
  onClose,
  providers,
  onAnalyze,
  loadAnalyses,
  loadAnalysisBlob,
}: {
  load(): Promise<{ library?: ResearchLibrary; materials: LocalMaterialEntry[] }>;
  save(command: ResearchCommand, expected: ResearchLibrary | undefined): Promise<ResearchLibrary>;
  loadBlob(id: string): Promise<Blob | undefined>;
  onPlace(entry: LocalMaterialEntry): Promise<void>;
  onImport(
    file: File,
    collectionId: string | undefined,
    expected: ResearchLibrary | undefined,
  ): Promise<void>;
  onClose(): void;
  providers: ProviderConfig[];
  onAnalyze(
    ids: string[],
    question: string,
    providerId: string,
    research: ResearchEntry[],
  ): Promise<string>;
  loadAnalyses(): Promise<Generation[]>;
  loadAnalysisBlob(
    projectId: string,
    generationId: string,
    snapshotId: string,
  ): Promise<Blob | undefined>;
}) {
  const { t } = useLocalization();
  const dialog = useRef<HTMLDialogElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const [library, setLibrary] = useState<ResearchLibrary>();
  const [materials, setMaterials] = useState<LocalMaterialEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(100);
  const [collectionId, setCollectionId] = useState('');
  const [draft, setDraft] = useState<Draft>();
  const [deletion, setDeletion] = useState<ResearchCommand>();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [review, setReview] = useState<ResearchEntry[]>();
  const [question, setQuestion] = useState('');
  const [providerId, setProviderId] = useState('');
  const [analysis, setAnalysis] = useState('');
  const [history, setHistory] = useState<Generation[]>([]);
  const [openHistory, setOpenHistory] = useState<string[]>([]);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  useEffect(() => {
    let disposed = false;
    void load()
      .then((data) => {
        if (!disposed) {
          setLibrary(data.library);
          setMaterials(data.materials);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!disposed) {
          setError(t('research.error'));
          setLoading(false);
        }
      });
    return () => {
      disposed = true;
    };
  }, [load, t]);
  const entries = library?.entries ?? [];
  const collections = library?.collections ?? [];
  const active = collections.find((item) => item.id === collectionId);
  const locked = busy || loading || Boolean(draft) || Boolean(deletion) || Boolean(review);
  const selected = entries.filter((entry) => selectedIds.includes(entry.id));
  const reviewImages = [
    ...new Set(review?.flatMap((entry) => (entry.assetId ? [entry.assetId] : [])) ?? []),
  ];
  const editEntry = (entry?: ResearchEntry) => {
    setError('');
    setNotice('');
    setDraft({
      kind: 'entry',
      id: entry?.id,
      title: entry?.title ?? '',
      assetId: entry?.assetId ?? '',
      notes: entry?.notes ?? '',
      tags: entry?.tags.join(', ') ?? '',
      sourceUrl: entry?.sourceUrl ?? '',
      brand: entry?.competitor?.brand ?? '',
      product: entry?.competitor?.product ?? '',
      recordedOn: entry?.competitor?.recordedOn ?? '',
    });
  };
  const commit = async (command: ResearchCommand) => {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const next = await save(command, library);
      setLibrary(next);
      setDraft(undefined);
      setDeletion(undefined);
      if (command.kind === 'delete-collection' && command.id === collectionId) setCollectionId('');
      setNotice(t('research.saved'));
    } catch {
      setError(t('research.error'));
    } finally {
      setBusy(false);
    }
  };
  const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  const visible = entries.filter(
    (entry) =>
      (!active || active.entryIds.includes(entry.id)) &&
      terms.every((term) =>
        [
          entry.title,
          entry.notes,
          entry.sourceUrl,
          ...entry.tags,
          entry.competitor?.brand,
          entry.competitor?.product,
        ]
          .join(' ')
          .toLocaleLowerCase()
          .includes(term),
      ),
  );
  return (
    <dialog
      ref={dialog}
      className="candidate-review exploration-batch material-library research-library"
      aria-labelledby="research-title"
      onCancel={(event) => {
        if (locked) event.preventDefault();
        else onClose();
      }}
    >
      <header>
        <h2 id="research-title">{t('research.title')}</h2>
        <button type="button" disabled={locked} onClick={onClose}>
          {t('common.close')}
        </button>
      </header>
      <p>{t('research.hint')}</p>
      <input
        ref={imageInput}
        type="file"
        hidden
        accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
        disabled={locked}
        aria-label={t('research.importImage')}
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file || locked) return;
          setBusy(true);
          setError('');
          setNotice('');
          try {
            await onImport(file, active?.id, library);
            const data = await load();
            setLibrary(data.library);
            setMaterials(data.materials);
            setQuery('');
            setNotice(t('research.saved'));
          } catch {
            setError(t('research.importError'));
          } finally {
            setBusy(false);
          }
        }}
      />
      {error ? <p role="alert">{error}</p> : null}
      {notice ? <p role="status">{notice}</p> : null}
      {loading ? <p>{t('materials.loading')}</p> : null}
      <div className="research-library__tools">
        <button type="button" disabled={locked} onClick={() => imageInput.current?.click()}>
          {t('research.importImage')}
        </button>
        <button type="button" disabled={locked} onClick={() => editEntry()}>
          {t('research.addEntry')}
        </button>
        <button
          type="button"
          disabled={locked}
          onClick={() => {
            setError('');
            setDraft({ kind: 'collection', name: '', entryIds: [] });
          }}
        >
          {t('research.addCollection')}
        </button>
        <button
          type="button"
          disabled={locked}
          onClick={async () => {
            setBusy(true);
            setError('');
            try {
              const data = await load();
              setLibrary(data.library);
              setMaterials(data.materials);
            } catch {
              setError(t('research.error'));
            } finally {
              setBusy(false);
            }
          }}
        >
          {t('research.reload')}
        </button>
      </div>
      <label>
        {t('research.search')}
        <input
          type="search"
          value={query}
          disabled={locked}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <label>
        {t('research.collection')}
        <select
          aria-label={t('research.collection')}
          value={collectionId}
          disabled={locked}
          onChange={(event) => setCollectionId(event.target.value)}
        >
          <option value="">{t('research.all')}</option>
          {collections.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} ({item.entryIds.length})
            </option>
          ))}
        </select>
      </label>
      {active ? (
        <div className="research-library__tools">
          <button
            type="button"
            disabled={locked}
            onClick={() =>
              setDraft({
                kind: 'collection',
                id: active.id,
                name: active.name,
                entryIds: [...active.entryIds],
              })
            }
          >
            {t('research.editCollection')}
          </button>
          <button
            type="button"
            disabled={locked}
            onClick={() => setDeletion({ kind: 'delete-collection', id: active.id })}
          >
            {t('research.deleteCollection')}
          </button>
        </div>
      ) : null}
      {deletion ? (
        <section className="research-library__confirm">
          <p>
            {t(
              deletion.kind === 'delete-entry'
                ? 'research.deleteEntryHint'
                : 'research.deleteCollectionHint',
            )}
          </p>
          <button type="button" disabled={busy} onClick={() => void commit(deletion)}>
            {t('research.confirmDelete')}
          </button>
          <button type="button" disabled={busy} onClick={() => setDeletion(undefined)}>
            {t('common.cancel')}
          </button>
        </section>
      ) : null}
      {draft ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (draft.kind === 'collection')
              void commit({
                kind: 'save-collection',
                id: draft.id,
                name: draft.name.trim(),
                entryIds: draft.entryIds,
              });
            else
              void commit({
                kind: 'save-entry',
                id: draft.id,
                entry: {
                  title: draft.title.trim(),
                  ...(draft.assetId ? { assetId: draft.assetId } : {}),
                  notes: draft.notes,
                  tags: draft.tags
                    .split(/[,，]/)
                    .map((tag) => tag.trim())
                    .filter(Boolean),
                  sourceUrl: draft.sourceUrl.trim(),
                  ...(draft.brand || draft.product || draft.recordedOn
                    ? {
                        competitor: {
                          brand: draft.brand,
                          product: draft.product,
                          recordedOn: draft.recordedOn,
                        },
                      }
                    : {}),
                },
              });
          }}
        >
          <fieldset disabled={busy}>
            <legend>
              {t(draft.kind === 'entry' ? 'research.entry' : 'research.editCollection')}
            </legend>
            {draft.kind === 'entry' ? (
              <>
                <label>
                  {t('research.name')}
                  <input
                    required
                    maxLength={200}
                    value={draft.title}
                    onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                  />
                </label>
                <label>
                  {t('research.image')}
                  <select
                    aria-label={t('research.image')}
                    value={draft.assetId}
                    onChange={(event) => setDraft({ ...draft, assetId: event.target.value })}
                  >
                    <option value="">{t('research.noImage')}</option>
                    {materials.map((item) => (
                      <option key={item.asset.id} value={item.asset.id}>
                        {item.asset.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t('research.notes')}
                  <textarea
                    aria-label={t('research.notes')}
                    maxLength={4000}
                    value={draft.notes}
                    onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
                  />
                </label>
                <label>
                  {t('research.source')}
                  <input
                    type="url"
                    maxLength={2048}
                    value={draft.sourceUrl}
                    onChange={(event) => setDraft({ ...draft, sourceUrl: event.target.value })}
                  />
                </label>
                <label>
                  {t('research.tags')}
                  <input
                    value={draft.tags}
                    maxLength={500}
                    onChange={(event) => setDraft({ ...draft, tags: event.target.value })}
                  />
                </label>
                <div className="research-library__fields">
                  <label>
                    {t('research.brand')}
                    <input
                      maxLength={200}
                      value={draft.brand}
                      onChange={(event) => setDraft({ ...draft, brand: event.target.value })}
                    />
                  </label>
                  <label>
                    {t('research.product')}
                    <input
                      maxLength={200}
                      value={draft.product}
                      onChange={(event) => setDraft({ ...draft, product: event.target.value })}
                    />
                  </label>
                  <label>
                    {t('research.date')}
                    <input
                      type="date"
                      value={draft.recordedOn}
                      onChange={(event) => setDraft({ ...draft, recordedOn: event.target.value })}
                    />
                  </label>
                </div>
              </>
            ) : (
              <>
                <label>
                  {t('research.name')}
                  <input
                    required
                    maxLength={100}
                    value={draft.name}
                    onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                  />
                </label>
                <p>{t('research.members')}</p>
                <div className="exploration-batch__sources">
                  {entries.map((entry) => (
                    <label key={entry.id}>
                      <input
                        type="checkbox"
                        checked={draft.entryIds.includes(entry.id)}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            entryIds: event.target.checked
                              ? [...draft.entryIds, entry.id]
                              : draft.entryIds.filter((id) => id !== entry.id),
                          })
                        }
                      />
                      {entry.title}
                    </label>
                  ))}
                </div>
              </>
            )}
            <div className="research-library__tools">
              <button type="submit">{t('common.save')}</button>
              <button
                type="button"
                onClick={() => {
                  setDraft(undefined);
                  setError('');
                }}
              >
                {t('common.cancel')}
              </button>
            </div>
          </fieldset>
        </form>
      ) : null}
      {!loading && !visible.length ? <p>{t('research.empty')}</p> : null}
      <section className="research-library__analysis">
        <h3>{t('research.analyze')}</h3>
        <p>{t('research.analyzeHint')}</p>
        <p>{t('research.selected', { count: selected.length })}</p>
        {!review ? (
          <button
            type="button"
            disabled={locked || !selected.length}
            onClick={() => {
              setReview(structuredClone(selected));
              setAnalysis('');
              setError('');
            }}
          >
            {t('research.review')}
          </button>
        ) : (
          <fieldset disabled={busy}>
            <legend>{t('research.review')}</legend>
            <p>{t('research.sent', { count: review.length, images: reviewImages.length })}</p>
            <div className="material-library__grid">
              {review.map((entry, index) => {
                const image = materials.find((item) => item.asset.id === entry.assetId)?.asset;
                return (
                  <article key={entry.id}>
                    {image?.storage.type === 'indexeddb' ? (
                      <MaterialPreview
                        blobId={image.storage.blobId}
                        name={entry.title}
                        load={loadBlob}
                      />
                    ) : null}
                    <strong>
                      {index + 1}. {entry.title}
                    </strong>
                    <p>{entry.notes}</p>
                    <small>{entry.tags.join(' · ')}</small>
                    <small>{entry.sourceUrl}</small>
                    {entry.competitor ? (
                      <small>
                        {[
                          entry.competitor.brand,
                          entry.competitor.product,
                          entry.competitor.recordedOn,
                        ].join(' · ')}
                      </small>
                    ) : null}
                  </article>
                );
              })}
            </div>
            <label>
              {t('materials.question')}
              <textarea
                aria-label={t('materials.question')}
                maxLength={4000}
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
              />
            </label>
            <label>
              {t('ai.provider')}
              <select
                aria-label={t('ai.provider')}
                value={providerId}
                onChange={(event) => setProviderId(event.target.value)}
              >
                <option value="">{t('ai.chooseProvider')}</option>
                {providers
                  .filter((provider) => provider.enabled !== false)
                  .map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.name} · {provider.model}
                    </option>
                  ))}
              </select>
            </label>
            <p>{t('generation.queue.cost')}</p>
            <button
              type="button"
              disabled={
                !question.trim() ||
                !providers.some(
                  (provider) => provider.id === providerId && provider.enabled !== false,
                )
              }
              onClick={async () => {
                setBusy(true);
                setError('');
                setAnalysis('');
                try {
                  setAnalysis(await onAnalyze(reviewImages, question, providerId, review));
                } catch {
                  setError(t('research.analysisError'));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {t('materials.runAnalysis')}
            </button>
            <button type="button" onClick={() => setReview(undefined)}>
              {t('common.cancel')}
            </button>
          </fieldset>
        )}
        {busy ? <p role="status">{t('materials.loading')}</p> : null}
        {analysis ? (
          <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{analysis}</p>
        ) : null}
        <button
          type="button"
          disabled={locked}
          onClick={async () => {
            setBusy(true);
            setError('');
            try {
              setHistory(
                (await loadAnalyses()).filter((run) =>
                  Array.isArray(run.parameters?.researchEvidence),
                ),
              );
            } catch {
              setError(t('research.error'));
            } finally {
              setBusy(false);
            }
          }}
        >
          {t('materials.history')}
        </button>
        {history.map((run) => (
          <details
            key={run.id}
            className="research-library__history"
            onToggle={(event) => {
              const open = event.currentTarget.open;
              setOpenHistory((ids) =>
                open ? [...new Set([...ids, run.id])] : ids.filter((id) => id !== run.id),
              );
            }}
          >
            <summary>
              {new Date(run.createdAt).toLocaleString()} ·{' '}
              {t(
                run.status === 'success'
                  ? 'generation.queue.success'
                  : run.status === 'pending'
                    ? 'generation.queue.running'
                    : 'feedback.analysisFailed',
              )}
            </summary>
            {typeof run.parameters?.question === 'string' ? <p>{run.parameters.question}</p> : null}
            <div className="material-library__grid">
              {Array.isArray(run.parameters?.researchEvidence)
                ? run.parameters.researchEvidence.map((record, index) => {
                    if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
                    const competitor =
                      record.competitor &&
                      typeof record.competitor === 'object' &&
                      !Array.isArray(record.competitor)
                        ? record.competitor
                        : undefined;
                    return (
                      <article key={index}>
                        <strong>
                          {index + 1}. {typeof record.title === 'string' ? record.title : ''}
                        </strong>
                        <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                          {typeof record.notes === 'string' ? record.notes : ''}
                        </p>
                        <small>
                          {Array.isArray(record.tags)
                            ? record.tags.filter((tag) => typeof tag === 'string').join(' · ')
                            : ''}
                        </small>
                        <small>
                          {typeof record.sourceUrl === 'string' ? record.sourceUrl : ''}
                        </small>
                        {competitor ? (
                          <small>
                            {[competitor.brand, competitor.product, competitor.recordedOn]
                              .filter((value) => typeof value === 'string')
                              .join(' · ')}
                          </small>
                        ) : null}
                      </article>
                    );
                  })
                : null}
            </div>
            <details>
              <summary>{t('materials.requestDetails')}</summary>
              <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{run.prompt}</p>
            </details>
            {openHistory.includes(run.id) && run.inputSnapshots?.length ? (
              <AnalysisEvidence run={run} load={loadAnalysisBlob} />
            ) : null}
            <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
              {typeof run.parameters?.analysis === 'string'
                ? run.parameters.analysis
                : t('materials.noAnalysis')}
            </p>
          </details>
        ))}
      </section>
      <div className="material-library__grid research-library__gallery">
        {visible.slice(0, limit).map((entry) => {
          const material = materials.find((item) => item.asset.id === entry.assetId);
          const blobId =
            material?.asset.storage.type === 'indexeddb'
              ? material.asset.storage.blobId
              : undefined;
          return (
            <article key={entry.id}>
              <label>
                <input
                  type="checkbox"
                  checked={selectedIds.includes(entry.id)}
                  disabled={locked || (!selectedIds.includes(entry.id) && selected.length >= 8)}
                  onChange={(event) =>
                    setSelectedIds((ids) =>
                      event.target.checked
                        ? [...ids, entry.id]
                        : ids.filter((id) => id !== entry.id),
                    )
                  }
                />
                {t('materials.selectCompare')}
              </label>
              {blobId ? (
                <MaterialPreview blobId={blobId} name={entry.title} load={loadBlob} />
              ) : null}
              <h3>{entry.title}</h3>
              <p>{entry.notes}</p>
              {entry.sourceUrl ? <small>{entry.sourceUrl}</small> : null}
              {entry.competitor ? (
                <small>
                  {[entry.competitor.brand, entry.competitor.product, entry.competitor.recordedOn]
                    .filter(Boolean)
                    .join(' · ')}
                </small>
              ) : null}
              {entry.tags.length ? <small>{entry.tags.join(' · ')}</small> : null}
              <button type="button" disabled={locked} onClick={() => editEntry(entry)}>
                {t('research.edit')}
              </button>
              {material ? (
                <button
                  type="button"
                  disabled={locked}
                  onClick={async () => {
                    setBusy(true);
                    setError('');
                    try {
                      await onPlace(material);
                      setNotice(t('materials.placed'));
                    } catch {
                      setError(t('research.error'));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {t('materials.place')}
                </button>
              ) : null}
              <button
                type="button"
                disabled={locked}
                onClick={() => setDeletion({ kind: 'delete-entry', id: entry.id })}
              >
                {t('research.deleteEntry')}
              </button>
            </article>
          );
        })}
      </div>
      {visible.length > limit ? (
        <button type="button" onClick={() => setLimit((value) => value + 100)}>
          {t('research.more')}
        </button>
      ) : null}
    </dialog>
  );
}
