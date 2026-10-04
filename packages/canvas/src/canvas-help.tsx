import { useRef } from 'react';
import { translate, type AppLocale } from '@open-industrial-design/core';

const gestures = ['select', 'pan', 'connect', 'zoom', 'undo', 'duplicate', 'delete'] as const;

/** Read-only help: no persisted state, provider calls or global keyboard listeners. */
export function CanvasHelp({ locale, disabled }: { locale: AppLocale; disabled: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" disabled={disabled} onClick={() => dialog.current?.showModal()}>
        {translate(locale, 'canvas.help.title')}
      </button>
      <dialog ref={dialog} className="canvas-help" aria-labelledby="canvas-help-title">
        <header>
          <h2 id="canvas-help-title">{translate(locale, 'canvas.help.title')}</h2>
          <button type="button" onClick={() => dialog.current?.close()}>
            {translate(locale, 'common.close')}
          </button>
        </header>
        <p>{translate(locale, 'canvas.help.scope')}</p>
        <dl>
          {gestures.map((gesture) => (
            <div key={gesture}>
              <dt>{translate(locale, `canvas.help.${gesture}`)}</dt>
              <dd>{translate(locale, `canvas.help.${gesture}Hint`)}</dd>
            </div>
          ))}
        </dl>
        <p>{translate(locale, 'canvas.help.safety')}</p>
      </dialog>
    </>
  );
}
