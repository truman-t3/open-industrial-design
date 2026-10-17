import { useEffect, useRef } from 'react';
import { LanguageSelector, useLocalization } from '@open-industrial-design/ui';
import { UiIcon } from './ui-icons';

export function WorkspaceSettingsMenu({
  onProviders,
  onAbout,
}: {
  onProviders: () => void;
  onAbout: () => void;
}) {
  const { locale, t } = useLocalization();
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !menu.current?.contains(event.target) && menu.current)
        menu.current.open = false;
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && menu.current?.open) {
        event.preventDefault();
        menu.current.open = false;
        menu.current.querySelector('summary')?.focus();
      }
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', escape);
    };
  }, []);
  const choose = (action: () => void) => {
    if (menu.current) menu.current.open = false;
    action();
  };
  const label = locale === 'zh-CN' ? '设置' : 'Settings';
  return (
    <details ref={menu} className="workspace-menu workspace-settings">
      <summary aria-label={label} title={label}>
        <UiIcon name="settings" size={18} />
      </summary>
      <div className="workspace-settings__panel">
        <strong>{label}</strong>
        <LanguageSelector />
        <button type="button" onClick={() => choose(onProviders)}>
          {t('workspace.providerSettings')}
        </button>
        <button type="button" onClick={() => choose(onAbout)}>
          {locale === 'zh-CN' ? '关于与更新' : 'About & updates'}
        </button>
      </div>
    </details>
  );
}
