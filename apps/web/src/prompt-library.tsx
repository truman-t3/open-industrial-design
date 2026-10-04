// SPDX-License-Identifier: MPL-2.0
import { useState } from 'react';
import { useLocalization } from '@open-industrial-design/ui';
import {
  readPromptLibrary,
  savePromptPreset,
  deletePromptPreset,
  type PromptPreset,
} from './prompt-library-store';

export function PromptLibrary({
  direction,
  notes = '',
  disabled,
  onApply,
}: {
  direction: string;
  notes?: string;
  disabled: boolean;
  onApply(value: { direction: string; notes: string }): void;
}) {
  const { t } = useLocalization();
  const [items, setItems] = useState<PromptPreset[]>([]);
  const [name, setName] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [deleteId, setDeleteId] = useState('');
  const selected = items.find((item) => item.id === selectedId);
  function load() {
    try {
      setItems(readPromptLibrary(localStorage));
      setLoaded(true);
      setStatus('');
    } catch {
      setLoaded(false);
      setStatus(t('prompt.error'));
    }
  }
  function save() {
    try {
      const preset = { id: crypto.randomUUID(), name, direction, notes };
      setItems(savePromptPreset(localStorage, preset));
      setSelectedId(preset.id);
      setName('');
      setStatus(t('prompt.saved'));
    } catch {
      setStatus(t('prompt.error'));
    }
  }
  function removeSelected() {
    if (!selected || disabled) return;
    try {
      setItems(deletePromptPreset(localStorage, selected.id));
      setSelectedId('');
      setDeleteId('');
      setStatus(t('prompt.deleted'));
    } catch {
      setStatus(t('prompt.error'));
    }
  }
  return (
    <details
      className="prompt-library"
      onToggle={(event) => {
        if (event.currentTarget.open) load();
      }}
    >
      <summary>{t('prompt.title')}</summary>
      <p>{t('prompt.hint')}</p>
      <label>
        {t('prompt.name')}
        <input
          maxLength={80}
          value={name}
          disabled={disabled}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <button
        type="button"
        disabled={disabled || !loaded || !name.trim() || !direction.trim()}
        onClick={save}
      >
        {t('prompt.save')}
      </button>
      <label>
        {t('prompt.search')}
        <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
      </label>
      {!loaded ? (
        <button type="button" onClick={load}>
          {t('prompt.reload')}
        </button>
      ) : null}
      <ul>
        {items
          .filter((item) =>
            `${item.name} ${item.direction} ${item.notes}`
              .toLocaleLowerCase()
              .includes(search.toLocaleLowerCase()),
          )
          .map((item) => (
            <li key={item.id}>
              <button
                type="button"
                aria-pressed={selectedId === item.id}
                onClick={() => {
                  setSelectedId(item.id);
                  setDeleteId('');
                }}
              >
                {item.name}
              </button>
            </li>
          ))}
      </ul>
      {loaded && !items.length ? <p>{t('prompt.empty')}</p> : null}
      {selected ? (
        <section aria-label={selected.name}>
          <strong>{selected.name}</strong>
          <p className="prompt-library__text">{selected.direction}</p>
          <p className="prompt-library__text">{selected.notes}</p>
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              onApply({ direction: selected.direction, notes: selected.notes });
              setStatus(t('prompt.applied'));
            }}
          >
            {t('prompt.apply')}
          </button>
          <button type="button" disabled={disabled} onClick={() => setDeleteId(selected.id)}>
            {t('prompt.delete')}
          </button>
          {deleteId === selected.id ? (
            <div>
              <p>{t('prompt.confirm')}</p>
              <button type="button" disabled={disabled} onClick={removeSelected}>
                {t('prompt.confirmDelete')}
              </button>
              <button type="button" onClick={() => setDeleteId('')}>
                {t('prompt.cancel')}
              </button>
            </div>
          ) : null}
        </section>
      ) : null}
      {status ? <p role="status">{status}</p> : null}
    </details>
  );
}
