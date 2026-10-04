import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import type {
  ActionContext,
  ActionDescriptor,
  ActionRunner,
  ActionRegistry,
} from '@open-industrial-design/actions';
import { useLocalization } from './localization';

interface ActionSurfaceProps {
  registry: ActionRegistry;
  runner: ActionRunner;
  context: ActionContext;
  runtime: unknown;
  onClose(): void;
}

const actionMessageKeys: Partial<
  Record<
    string,
    {
      description: Parameters<ReturnType<typeof useLocalization>['t']>[0];
      label: Parameters<ReturnType<typeof useLocalization>['t']>[0];
    }
  >
> = {
  'workspace.groupSelection': { label: 'workspace.group', description: 'workspace.groupHint' },
  'workspace.ungroupSelection': { label: 'workspace.ungroup', description: 'workspace.groupHint' },
  'workspace.duplicateSelection': {
    label: 'action.workspace.duplicate.label',
    description: 'action.workspace.duplicate.description',
  },
  'workspace.deleteSelection': {
    label: 'action.workspace.delete.label',
    description: 'action.workspace.delete.description',
  },
  'design.createVariant': {
    label: 'action.design.variant.label',
    description: 'action.design.variant.description',
  },
  'ai.textGenerate': { label: 'action.ai.text.label', description: 'action.ai.text.description' },
  'ai.testConnection': { label: 'action.ai.test.label', description: 'action.ai.test.description' },
  'ai.analyzeDesign': {
    label: 'action.ai.analyze.label',
    description: 'action.ai.analyze.description',
  },
  'ai.generateVariant': {
    label: 'action.ai.variant.label',
    description: 'action.ai.variant.description',
  },
  'ai.keepCandidate': { label: 'action.ai.keep.label', description: 'action.ai.keep.description' },
};

function useActionState(runner: ActionRunner) {
  return useSyncExternalStore(runner.subscribe, runner.getState, runner.getState);
}

function ActionList({
  registry,
  runner,
  context,
  runtime,
  onClose,
  query = '',
}: ActionSurfaceProps & { query?: string }) {
  const { t } = useLocalization();
  const [error, setError] = useState<string>();
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const localizedAction = (action: ActionDescriptor) => {
    const keys = actionMessageKeys[action.id];
    return keys ? { description: t(keys.description), label: t(keys.label) } : action;
  };
  const actions = registry.listRunnable(context).filter((action) => {
    const localized = localizedAction(action);
    return `${localized.label} ${localized.description} ${action.label} ${action.description}`
      .toLocaleLowerCase()
      .includes(normalizedQuery);
  });
  const executionState = useActionState(runner);
  const runningActionIds = new Set(
    executionState.executions
      .filter((execution) => execution.status === 'running')
      .map((execution) => execution.actionId),
  );

  const run = async (descriptor: ActionDescriptor) => {
    if (descriptor.defaultInput === undefined) return;
    setError(undefined);
    const record = await runner.run({
      actionId: descriptor.id,
      context,
      input: descriptor.defaultInput,
      runtime,
    });
    if (record.status === 'success') onClose();
    else setError(record.error?.message ?? t('action.failed'));
  };

  if (!actions.length) return <p className="action-surface__empty">{t('action.empty')}</p>;

  return (
    <>
      <div className="action-surface__list">
        {actions.map((action) => (
          <button
            className="action-surface__item"
            disabled={runningActionIds.has(action.id)}
            key={action.id}
            onClick={() => void run(action)}
            type="button"
          >
            <span>{localizedAction(action).label}</span>
            <small>{localizedAction(action).description}</small>
          </button>
        ))}
      </div>
      {error ? (
        <p className="action-surface__error" role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}

export interface ActionCommandPaletteProps extends Omit<ActionSurfaceProps, 'onClose'> {
  open: boolean;
  onClose(): void;
}

/** UI-only command palette. It invokes Actions, never provider SDKs or Canvas APIs. */
export function ActionCommandPalette({ open, onClose, ...props }: ActionCommandPaletteProps) {
  const { t } = useLocalization();
  const [query, setQuery] = useState('');
  if (!open) return null;
  return (
    <div className="action-palette-backdrop" onMouseDown={onClose} role="presentation">
      <section
        aria-label={t('action.palette')}
        className="action-palette"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="action-palette__header">
          <label htmlFor="action-search">{t('action.commands')}</label>
          <button onClick={onClose} type="button">
            {t('common.close')}
          </button>
        </div>
        <input
          autoFocus
          id="action-search"
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('action.search')}
          value={query}
        />
        <ActionList {...props} onClose={onClose} query={query} />
      </section>
    </div>
  );
}

export interface ActionContextMenuProps extends ActionSurfaceProps {
  position: { x: number; y: number };
}

/** Selection context menu backed by the same ActionRegistry as the palette. */
export function ActionContextMenu({ position, ...props }: ActionContextMenuProps) {
  const { t } = useLocalization();
  const menuRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const place = () => {
      menu.style.left = `${Math.max(8, Math.min(position.x, window.innerWidth - menu.offsetWidth - 8))}px`;
      menu.style.top = `${Math.max(8, Math.min(position.y, window.innerHeight - menu.offsetHeight - 8))}px`;
    };
    place();
    menu.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    const observer = new ResizeObserver(place);
    observer.observe(menu);
    window.addEventListener('resize', place);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', place);
    };
  }, [position.x, position.y]);
  const onClose = props.onClose;
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) onClose();
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [onClose]);
  return (
    <div
      ref={menuRef}
      aria-label={t('action.selection')}
      className="action-context-menu"
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Escape' || event.key === 'Tab') {
          onClose();
          return;
        }
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
        event.preventDefault();
        const buttons = Array.from(
          event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
        );
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next =
          (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }}
      role="menu"
      style={{ left: position.x, top: position.y }}
    >
      <ActionList {...props} />
    </div>
  );
}
