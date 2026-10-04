import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocalization } from '@open-industrial-design/ui';
import type { LocalMaterialEntry } from '@open-industrial-design/storage';
import type { ProviderConfig } from '@open-industrial-design/ai-core';
import type { Generation } from '@open-industrial-design/design-model';
import {
  isValidMaterialKnowledge,
  type MaterialKnowledge,
} from '@open-industrial-design/design-model';

export function MaterialPreview({
  blobId,
  name,
  load,
}: {
  blobId: string;
  name: string;
  load(id: string): Promise<Blob | undefined>;
}) {
  const [url, setUrl] = useState('');
  const [failed, setFailed] = useState(false);
  const { t } = useLocalization();
  useEffect(() => {
    let disposed = false;
    let created = '';
    setUrl('');
    setFailed(false);
    void load(blobId)
      .then((blob) => {
        if (disposed) return;
        if (!blob) {
          setFailed(true);
          return;
        }
        created = URL.createObjectURL(blob);
        setUrl(created);
      })
      .catch(() => {
        if (!disposed) setFailed(true);
      });
    return () => {
      disposed = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [blobId, load]);
  return url && !failed ? (
    <img src={url} alt={name} onError={() => setFailed(true)} />
  ) : (
    <div className="material-library__placeholder">
      {t(failed ? 'materials.missing' : 'materials.loading')}
    </div>
  );
}

export function AnalysisEvidence({
  run,
  load,
}: {
  run: Generation;
  load(projectId: string, generationId: string, snapshotId: string): Promise<Blob | undefined>;
}) {
  const { t } = useLocalization();
  const loader = useCallback(
    (id: string) => load(run.projectId, run.id, id),
    [load, run.projectId, run.id],
  );
  return run.inputSnapshots?.length ? (
    <div className="material-library__grid">
      {run.inputSnapshots.map((input, index) => {
        const evidence = Array.isArray(run.parameters?.evidence)
          ? run.parameters.evidence[index]
          : undefined;
        const name =
          evidence &&
          typeof evidence === 'object' &&
          !Array.isArray(evidence) &&
          typeof evidence.name === 'string'
            ? evidence.name
            : (input.sourceAssetId ?? '');
        const label = `${index + 1}. ${name}`;
        return (
          <article key={input.id}>
            <MaterialPreview blobId={input.id} name={label} load={loader} />
            <small>{label}</small>
          </article>
        );
      })}
    </div>
  ) : (
    <p>{t('materials.noSnapshots')}</p>
  );
}

export function MaterialLibrary({
  projectId,
  search,
  load,
  onPlace,
  onSave,
  providers,
  onAnalyze,
  loadAnalyses,
  loadAnalysisBlob,
  onClose,
}: {
  projectId: string;
  search(query: string, projectId?: string): Promise<LocalMaterialEntry[]>;
  load(id: string): Promise<Blob | undefined>;
  onPlace(entry: LocalMaterialEntry): Promise<void>;
  onSave(entry: LocalMaterialEntry, knowledge: MaterialKnowledge): Promise<void>;
  providers: ProviderConfig[];
  onAnalyze(ids: string[], question: string, providerId: string): Promise<string>;
  loadAnalyses(): Promise<Generation[]>;
  loadAnalysisBlob(
    projectId: string,
    generationId: string,
    snapshotId: string,
  ): Promise<Blob | undefined>;
  onClose(): void;
}) {
  const { t } = useLocalization();
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState('');
  const [allProjects, setAllProjects] = useState(false);
  const [entries, setEntries] = useState<LocalMaterialEntry[]>([]);
  const [limit, setLimit] = useState(24);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState<LocalMaterialEntry[]>([]);
  const [question, setQuestion] = useState('');
  const [providerId, setProviderId] = useState('');
  const [analysis, setAnalysis] = useState('');
  const [history, setHistory] = useState<Generation[]>([]);
  const [openHistoryIds, setOpenHistoryIds] = useState<string[]>([]);
  const [editing, setEditing] = useState<{
    entry: LocalMaterialEntry;
    notes: string;
    tags: string;
    sourceUrl: string;
  }>();
  const draft = editing
    ? {
        notes: editing.notes,
        sourceUrl: editing.sourceUrl.trim(),
        tags: editing.tags
          .split(/[,，]/)
          .map((tag) => tag.trim())
          .filter(Boolean),
      }
    : undefined;
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  useEffect(() => {
    let disposed = false;
    setLoading(true);
    setError('');
    setLimit(24);
    const timer = setTimeout(() => {
      void search(query, allProjects ? undefined : projectId)
        .then((result) => {
          if (!disposed) {
            setEntries(result);
            setLoading(false);
          }
        })
        .catch(() => {
          if (!disposed) {
            setError(t('materials.error'));
            setLoading(false);
          }
        });
    }, 150);
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [query, allProjects, projectId, search, t]);
  return (
    <dialog
      ref={dialog}
      className="candidate-review exploration-batch material-library"
      aria-labelledby="material-library-title"
      onCancel={(event) => {
        if (busy || editing) event.preventDefault();
        else onClose();
      }}
    >
      <header>
        <h2 id="material-library-title">{t('materials.title')}</h2>
        <button type="button" disabled={busy || Boolean(editing)} onClick={onClose}>
          {t('common.close')}
        </button>
      </header>
      <p>{t('materials.hint')}</p>
      <label>
        {t('materials.search')}
        <input
          type="search"
          value={query}
          maxLength={200}
          disabled={busy || Boolean(editing)}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <label>
        <input
          type="checkbox"
          checked={allProjects}
          disabled={busy || Boolean(editing)}
          onChange={(event) => setAllProjects(event.target.checked)}
        />
        {t('materials.allProjects')}
      </label>
      {error ? <p role="alert">{error}</p> : null}
      {notice ? <p role="status">{notice}</p> : null}
      <details>
        <summary>{t('materials.compare')}</summary>
        <p>{t('materials.compareHint')}</p>
        <fieldset disabled={busy || Boolean(editing)}>
          <legend>{t('materials.selected', { count: selected.length })}</legend>
          {selected.map((entry, index) => (
            <div key={entry.asset.id}>
              {index + 1}. {entry.asset.name}{' '}
              <button
                type="button"
                onClick={() =>
                  setSelected((items) => items.filter((item) => item.asset.id !== entry.asset.id))
                }
              >
                {t('common.cancel')}
              </button>
            </div>
          ))}
          <label className="inspector-generation__field">
            {t('materials.question')}
            <textarea
              aria-label={t('materials.question')}
              rows={3}
              maxLength={4000}
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
            />
          </label>
          <label className="inspector-generation__field">
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
            disabled={selected.length < 2 || !question.trim() || !providerId}
            onClick={async () => {
              setBusy(true);
              setError('');
              setAnalysis('');
              try {
                setAnalysis(
                  await onAnalyze(
                    selected.map((entry) => entry.asset.id),
                    question,
                    providerId,
                  ),
                );
              } catch {
                setError(t('materials.analysisError'));
              } finally {
                setBusy(false);
              }
            }}
          >
            {t('materials.runAnalysis')}
          </button>
          <button
            type="button"
            onClick={async () => {
              setBusy(true);
              setError('');
              try {
                setHistory(await loadAnalyses());
              } catch {
                setError(t('materials.error'));
              } finally {
                setBusy(false);
              }
            }}
          >
            {t('materials.history')}
          </button>
        </fieldset>
        {busy ? <p role="status">{t('materials.loading')}</p> : null}
        {analysis ? (
          <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{analysis}</p>
        ) : null}
        {history.map((run) => (
          <details
            key={run.id}
            onToggle={(event) => {
              const open = event.currentTarget.open;
              setOpenHistoryIds((ids) =>
                open
                  ? ids.includes(run.id)
                    ? ids
                    : [...ids, run.id]
                  : ids.filter((id) => id !== run.id),
              );
            }}
          >
            <summary>
              {new Date(run.createdAt).toLocaleString()} ·{' '}
              {run.status === 'success'
                ? t('generation.queue.success')
                : run.status === 'pending'
                  ? t('generation.queue.running')
                  : t('feedback.analysisFailed')}
            </summary>
            {typeof run.parameters?.question === 'string' ? (
              <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                {run.parameters.question}
              </p>
            ) : null}
            <details>
              <summary>{t('materials.requestDetails')}</summary>
              <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{run.prompt}</p>
            </details>
            {openHistoryIds.includes(run.id) ? (
              <AnalysisEvidence run={run} load={loadAnalysisBlob} />
            ) : null}
            <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
              {typeof run.parameters?.analysis === 'string'
                ? run.parameters.analysis
                : t('materials.noAnalysis')}
            </p>
          </details>
        ))}
      </details>
      {editing && draft ? (
        <fieldset disabled={busy} className="material-library__editor">
          <legend>
            {t('materials.edit')} · {editing.entry.asset.name}
          </legend>
          <p>{t('materials.knowledgeHint')}</p>
          <label className="inspector-generation__field">
            <span>{t('materials.notes')}</span>
            <textarea
              aria-label={t('materials.notes')}
              rows={4}
              maxLength={4000}
              value={editing.notes}
              onChange={(event) => setEditing({ ...editing, notes: event.target.value })}
            />
          </label>
          <label className="inspector-generation__field">
            <span>{t('materials.tags')}</span>
            <input
              maxLength={600}
              aria-label={t('materials.tags')}
              value={editing.tags}
              onChange={(event) => setEditing({ ...editing, tags: event.target.value })}
            />
          </label>
          <label className="inspector-generation__field">
            <span>{t('materials.source')}</span>
            <input
              type="url"
              aria-label={t('materials.source')}
              maxLength={2048}
              value={editing.sourceUrl}
              onChange={(event) => setEditing({ ...editing, sourceUrl: event.target.value })}
            />
          </label>
          {!isValidMaterialKnowledge(draft) ? <p role="alert">{t('materials.invalid')}</p> : null}
          <button
            type="button"
            disabled={!isValidMaterialKnowledge(draft)}
            onClick={async () => {
              setBusy(true);
              setError('');
              setNotice('');
              try {
                await onSave(editing.entry, draft);
                setEntries((current) =>
                  current.map((entry) =>
                    entry.asset.id === editing.entry.asset.id
                      ? { ...entry, asset: { ...entry.asset, knowledge: draft } }
                      : entry,
                  ),
                );
                setEditing(undefined);
                setNotice(t('materials.saved'));
              } catch {
                setError(t('materials.saveError'));
              } finally {
                setBusy(false);
              }
            }}
          >
            {t('materials.save')}
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(undefined);
              setError('');
            }}
          >
            {t('common.cancel')}
          </button>
        </fieldset>
      ) : null}
      {loading ? (
        <p role="status">{t('materials.loading')}</p>
      ) : (
        <>
          <p>{t('materials.count', { count: entries.length })}</p>
          {!entries.length ? <p>{t('materials.empty')}</p> : null}
          <div className="material-library__grid">
            {entries.slice(0, limit).map((entry) => (
              <article key={entry.asset.id}>
                <MaterialPreview
                  blobId={
                    entry.asset.storage.type === 'indexeddb' ? entry.asset.storage.blobId : ''
                  }
                  name={entry.asset.name}
                  load={load}
                />
                <strong>{entry.asset.name}</strong>
                {entry.asset.projectId === projectId ? (
                  <label>
                    <input
                      type="checkbox"
                      disabled={
                        busy ||
                        Boolean(editing) ||
                        (selected.length >= 8 &&
                          !selected.some((item) => item.asset.id === entry.asset.id))
                      }
                      checked={selected.some((item) => item.asset.id === entry.asset.id)}
                      onChange={(event) =>
                        setSelected((items) =>
                          event.target.checked
                            ? [...items, entry]
                            : items.filter((item) => item.asset.id !== entry.asset.id),
                        )
                      }
                    />
                    {t('materials.selectCompare')}
                  </label>
                ) : null}
                <small>{entry.projectName}</small>
                {entry.notes.length ? <p>{entry.notes.join(' · ')}</p> : null}
                {entry.asset.knowledge?.notes ? <p>{entry.asset.knowledge.notes}</p> : null}
                {entry.asset.knowledge?.tags.length ? (
                  <small>{entry.asset.knowledge.tags.join(' · ')}</small>
                ) : null}
                {entry.asset.knowledge?.sourceUrl ? (
                  <small>
                    {t('materials.source')}：{entry.asset.knowledge.sourceUrl}
                  </small>
                ) : null}
                {entry.asset.projectId === projectId ? (
                  <button
                    type="button"
                    disabled={busy || Boolean(editing)}
                    onClick={() => {
                      setError('');
                      setNotice('');
                      setEditing({
                        entry,
                        notes: entry.asset.knowledge?.notes ?? '',
                        tags: entry.asset.knowledge?.tags.join(', ') ?? '',
                        sourceUrl: entry.asset.knowledge?.sourceUrl ?? '',
                      });
                    }}
                  >
                    {t('materials.edit')}
                  </button>
                ) : (
                  <small>{t('materials.copyFirst')}</small>
                )}
                <button
                  type="button"
                  disabled={busy || Boolean(editing)}
                  onClick={async () => {
                    setBusy(true);
                    setError('');
                    setNotice('');
                    try {
                      await onPlace(entry);
                      setNotice(t('materials.placed'));
                    } catch {
                      setError(t('materials.placeError'));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {t('materials.place')}
                </button>
              </article>
            ))}
          </div>
          {entries.length > limit ? (
            <button type="button" disabled={busy} onClick={() => setLimit((value) => value + 24)}>
              {t('materials.more')}
            </button>
          ) : null}
        </>
      )}
    </dialog>
  );
}
