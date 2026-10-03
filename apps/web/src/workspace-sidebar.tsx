import { translateDemoLabel } from '@open-industrial-design/core';
import type { Board, Project } from '@open-industrial-design/design-model';
import { useLocalization } from '@open-industrial-design/ui';
import { BrandLogo } from './brand';
import { UiIcon } from './ui-icons';

export interface WorkspaceSidebarProps {
  boards: readonly Board[];
  onCreateBoard(): void;
  onDeleteBoard(board: Board): void;
  onGoHome(): void;
  onRenameBoard(board: Board): void;
  onSelectBoard(board: Board): void;
  project: Project;
}

export function WorkspaceSidebar({
  boards,
  onCreateBoard,
  onDeleteBoard,
  onGoHome,
  onRenameBoard,
  onSelectBoard,
  project,
}: WorkspaceSidebarProps) {
  const { locale, t } = useLocalization();
  const projectName = translateDemoLabel(locale, project.name);
  return (
    <nav aria-label={t('workspace.project')} className="workspace-sidebar">
      <div className="workspace-sidebar__brand">
        <BrandLogo className="brand-logo brand-logo--workspace-wordmark" variant="light" />
      </div>
      <button className="workspace-sidebar__home" onClick={onGoHome} type="button">
        <UiIcon name="home" />
        {t('workspace.home')}
      </button>
      <div className="workspace-sidebar__project">
        <strong>{projectName}</strong>
        <span>{t('workspace.localProject', { count: project.boardIds.length })}</span>
      </div>
      <div className="workspace-sidebar__section-heading">
        <span>{t('workspace.boards')}</span>
        <button aria-label={t('workspace.newBoard')} onClick={onCreateBoard} type="button">
          <UiIcon name="plus" size={14} />
        </button>
      </div>
      <div className="workspace-sidebar__boards">
        {boards.map((board) => (
          <div
            className={
              board.id === project.activeBoardId
                ? 'workspace-sidebar__board workspace-sidebar__board--active'
                : 'workspace-sidebar__board'
            }
            key={board.id}
          >
            <button onClick={() => onSelectBoard(board)} type="button">
              <UiIcon name="board" size={15} />
              {translateDemoLabel(locale, board.name)}
            </button>
            <div>
              <button
                aria-label={`${t('common.rename')} ${translateDemoLabel(locale, board.name)}`}
                onClick={() => onRenameBoard(board)}
                type="button"
              >
                <UiIcon name="more" size={15} />
              </button>
              <button
                aria-label={`${t('common.delete')} ${translateDemoLabel(locale, board.name)}`}
                onClick={() => onDeleteBoard(board)}
                type="button"
              >
                <UiIcon name="close" size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
      <button className="workspace-sidebar__new-board" onClick={onCreateBoard} type="button">
        <UiIcon name="plus" size={14} />
        {t('workspace.newBoard')}
      </button>
      <p className="workspace-sidebar__hint">{t('workspace.boardHint')}</p>
    </nav>
  );
}
