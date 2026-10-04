import { useEffect, useRef, useState } from 'react';
import { useLocalization } from '@open-industrial-design/ui';
import type { CreateExplorationBatchInput } from '@open-industrial-design/actions';
import type { CanvasBatchProgress } from '@open-industrial-design/actions';
import type { GenerationNode } from '@open-industrial-design/design-model';
import type { ProviderConfig } from '@open-industrial-design/ai-core';

export function ExplorationQueue({
  tasks,
  inputSummaries,
  initialIds,
  providers,
  providerId,
  ready,
  busy,
  progress,
  report,
  onProviderChange,
  onRun,
  onCancel,
  onClose,
}: {
  tasks: GenerationNode[];
  inputSummaries: Readonly<Record<string, string>>;
  initialIds: string[];
  providers: ProviderConfig[];
  providerId: string;
  ready: boolean;
  busy: boolean;
  progress?: CanvasBatchProgress;
  report: string;
  onProviderChange(id: string): void;
  onRun(tasks: GenerationNode[]): Promise<void>;
  onCancel(): void;
  onClose(): void;
}) {
  const { t } = useLocalization();
  const dialog = useRef<HTMLDialogElement>(null);
  const [ids, setIds] = useState(() =>
    initialIds.filter((id) => tasks.some((task) => task.id === id)).slice(0, 16),
  );
  const [started, setStarted] = useState(false);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  const selected = ids.flatMap((id) => tasks.find((task) => task.id === id) ?? []);
  const requiresProvider = selected.some((task) => !task.patternPlacement);
  const locked = busy || started;
  return (
    <dialog
      className="candidate-review exploration-batch"
      ref={dialog}
      aria-labelledby="exploration-queue-title"
      onCancel={(event) => {
        if (busy) event.preventDefault();
        else onClose();
      }}
    >
      <header>
        <h2 id="exploration-queue-title">{t('generation.queue.title')}</h2>
        <button type="button" disabled={busy} onClick={onClose}>
          {t('common.close')}
        </button>
      </header>
      <p>{t('generation.queue.hint')}</p>
      <fieldset disabled={locked}>
        <legend>{t('generation.queue.tasks')}</legend>
        <div className="exploration-batch__sources">
          {tasks.map((task) => (
            <label key={task.id}>
              <input
                type="checkbox"
                checked={ids.includes(task.id)}
                disabled={!ids.includes(task.id) && ids.length >= 16}
                onChange={(event) =>
                  setIds((current) =>
                    event.target.checked
                      ? [...current, task.id]
                      : current.filter((id) => id !== task.id),
                  )
                }
              />
              <span>
                {task.label} · {task.count}
                <small className="exploration-queue__source">{inputSummaries[task.id]}</small>
                <br />
                {task.direction}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {selected.length ? (
        <section aria-label={t('generation.queue.order')}>
          <h3>{t('generation.queue.order')}</h3>
          <p>{t('generation.queue.orderHint')}</p>
          <ol className="exploration-queue__order">
            {selected.map((task, index) => (
              <li key={task.id}>
                <span>{task.label}</span>
                <small className="exploration-queue__source">{inputSummaries[task.id]}</small>
                <div>
                  {(['up', 'down'] as const).map((direction) => (
                    <button
                      key={direction}
                      type="button"
                      aria-label={t(`generation.queue.${direction}`, { name: task.label ?? '' })}
                      disabled={
                        locked || (direction === 'up' ? index === 0 : index === selected.length - 1)
                      }
                      onClick={() => {
                        const ordered = selected.map((item) => item.id);
                        const next = index + (direction === 'up' ? -1 : 1);
                        [ordered[index], ordered[next]] = [ordered[next]!, ordered[index]!];
                        setIds(ordered);
                      }}
                    >
                      {direction === 'up' ? '↑' : '↓'}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
      {requiresProvider ? (
        <label className="inspector-generation__field">
          <span>{t('ai.provider')}</span>
          <select
            aria-label={t('ai.provider')}
            value={providerId}
            disabled={locked}
            onChange={(event) => onProviderChange(event.target.value)}
          >
            <option value="">{t('ai.chooseProvider')}</option>
            {providers
              .filter((provider) => provider.enabled !== false)
              .map((provider) => (
                <option value={provider.id} key={provider.id}>
                  {provider.name} · {provider.model}
                </option>
              ))}
          </select>
        </label>
      ) : null}
      <p>
        {t('generation.queue.summary', {
          tasks: selected.length,
          images: selected.reduce((sum, task) => sum + task.count, 0),
        })}
      </p>
      {requiresProvider ? <p>{t('generation.queue.cost')}</p> : null}
      {progress ? (
        <p role="status">
          {progress.index} / {progress.total} ·{' '}
          {tasks.find((task) => task.id === progress.nodeId)?.label} ·{' '}
          {t(`generation.queue.${progress.status}`)}
        </p>
      ) : null}
      {report ? <p role="status">{report}</p> : null}
      {busy ? (
        <button type="button" onClick={onCancel}>
          {t('generation.cancel')}
        </button>
      ) : (
        <button
          type="button"
          disabled={locked || !selected.length || (requiresProvider && !ready)}
          onClick={async () => {
            setStarted(true);
            await onRun(selected);
          }}
        >
          {t('generation.queue.run')}
        </button>
      )}
    </dialog>
  );
}

/** Draft preparation only. Creation never submits an AI request. */
export function ExplorationBatch({
  sources,
  selectedIds,
  onPrepare,
  onClose,
}: {
  sources: Array<{ id: string; label: string }>;
  selectedIds: string[];
  onPrepare(input: CreateExplorationBatchInput): Promise<void>;
  onClose(): void;
}) {
  const { t } = useLocalization();
  const dialog = useRef<HTMLDialogElement>(null);
  const [sourceNodeIds, setSourceNodeIds] = useState(() =>
    selectedIds.filter((id) => sources.some((source) => source.id === id)).slice(0, 4),
  );
  const [directions, setDirections] = useState([{ label: '', direction: '' }]);
  const [sharedBrief, setSharedBrief] = useState('');
  const [referenceNodeIds, setReferenceNodeIds] = useState<string[]>([]);
  const [count, setCount] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  const valid =
    sourceNodeIds.length > 0 &&
    directions.every(
      (item) =>
        item.label.trim() &&
        item.direction.trim() &&
        [sharedBrief.trim(), item.direction.trim()].filter(Boolean).join('\n\n').length <= 10000,
    );
  const overLimit = directions.some(
    (item) =>
      [sharedBrief.trim(), item.direction.trim()].filter(Boolean).join('\n\n').length > 10000,
  );
  return (
    <dialog
      className="candidate-review exploration-batch"
      ref={dialog}
      aria-labelledby="exploration-batch-title"
      onCancel={(event) => {
        if (busy) event.preventDefault();
        else onClose();
      }}
    >
      <header>
        <h2 id="exploration-batch-title">{t('generation.batch.title')}</h2>
        <button type="button" disabled={busy} onClick={onClose}>
          {t('common.close')}
        </button>
      </header>
      <p>{t('generation.batch.hint')}</p>
      <label className="inspector-generation__field">
        <span>{t('generation.batch.sharedBrief')}</span>
        <textarea
          aria-label={t('generation.batch.sharedBrief')}
          aria-describedby="batch-shared-brief-hint"
          rows={3}
          maxLength={4000}
          disabled={busy}
          value={sharedBrief}
          onChange={(event) => setSharedBrief(event.target.value)}
        />
      </label>
      <p id="batch-shared-brief-hint">{t('generation.batch.sharedBriefHint')}</p>
      <fieldset disabled={busy}>
        <legend>{t('generation.batch.sources')}</legend>
        <div className="exploration-batch__sources">
          {sources.map((source) => (
            <label key={source.id}>
              <input
                type="checkbox"
                checked={sourceNodeIds.includes(source.id)}
                disabled={
                  referenceNodeIds.includes(source.id) ||
                  (!sourceNodeIds.includes(source.id) && sourceNodeIds.length >= 4)
                }
                onChange={(event) =>
                  setSourceNodeIds((current) =>
                    event.target.checked
                      ? [...current, source.id]
                      : current.filter((id) => id !== source.id),
                  )
                }
              />
              {source.label}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset disabled={busy}>
        <legend>{t('generation.batch.references')}</legend>
        <p>{t('generation.batch.referencesHint')}</p>
        <div className="exploration-batch__sources">
          {sources.map((source) => (
            <label key={source.id}>
              <input
                type="checkbox"
                checked={referenceNodeIds.includes(source.id)}
                disabled={
                  sourceNodeIds.includes(source.id) ||
                  (!referenceNodeIds.includes(source.id) && referenceNodeIds.length >= 4)
                }
                onChange={(event) =>
                  setReferenceNodeIds((current) =>
                    event.target.checked
                      ? [...current, source.id]
                      : current.filter((id) => id !== source.id),
                  )
                }
              />
              {source.label}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset disabled={busy}>
        <legend>{t('generation.batch.directions')}</legend>
        {directions.map((item, index) => (
          <div className="exploration-batch__direction" key={index}>
            <label className="inspector-generation__field">
              <span>{t('generation.batch.name', { number: index + 1 })}</span>
              <input
                maxLength={80}
                value={item.label}
                onChange={(event) =>
                  setDirections((current) =>
                    current.map((row, i) =>
                      i === index ? { ...row, label: event.target.value } : row,
                    ),
                  )
                }
              />
            </label>
            <label className="inspector-generation__field">
              <span>{t('generation.direction')}</span>
              <textarea
                aria-label={`${t('generation.direction')} ${index + 1}`}
                rows={3}
                maxLength={10000}
                value={item.direction}
                onChange={(event) =>
                  setDirections((current) =>
                    current.map((row, i) =>
                      i === index ? { ...row, direction: event.target.value } : row,
                    ),
                  )
                }
              />
            </label>
            <button
              type="button"
              disabled={directions.length === 1}
              onClick={() => setDirections((current) => current.filter((_, i) => i !== index))}
            >
              {t('generation.batch.remove')}
            </button>
          </div>
        ))}
        <button
          type="button"
          disabled={directions.length >= 4}
          onClick={() => setDirections((current) => [...current, { label: '', direction: '' }])}
        >
          {t('generation.batch.add')}
        </button>
      </fieldset>
      <label className="inspector-generation__field">
        <span>{t('generation.batch.count')}</span>
        <select
          disabled={busy}
          aria-label={t('generation.batch.count')}
          value={count}
          onChange={(event) => setCount(Number(event.target.value))}
        >
          {[1, 2, 3, 4].map((value) => (
            <option value={value} key={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
      <p role="status">
        {t('generation.batch.summary', {
          tasks: sourceNodeIds.length * directions.length,
          images: sourceNodeIds.length * directions.length * count,
        })}
      </p>
      {error ? <p role="alert">{error}</p> : null}
      {overLimit ? <p role="alert">{t('generation.batch.briefLimit')}</p> : null}
      <button
        type="button"
        disabled={busy || !valid}
        onClick={async () => {
          setBusy(true);
          setError('');
          try {
            await onPrepare({
              sourceNodeIds,
              referenceNodeIds,
              sharedBrief: sharedBrief.trim() || undefined,
              directions,
              count,
            });
            onClose();
          } catch {
            setError(t('generation.batch.failed'));
          } finally {
            setBusy(false);
          }
        }}
      >
        {t('generation.batch.prepare')}
      </button>
    </dialog>
  );
}
