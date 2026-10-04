import { translateDemoLabel } from '@open-industrial-design/core';
import { LanguageSelector, useLocalization } from '@open-industrial-design/ui';
import type { Project } from '@open-industrial-design/design-model';
import { BrandLogo } from './brand';

export interface ProjectHomeProps {
  projects: readonly Project[];
  loading: boolean;
  demoOpening?: boolean;
  importBusy?: boolean;
  onImportProject?(): void;
  coverUrls?: Record<string, string>;
  onCreateProject(): void;
  onDeleteProject(project: Project): void;
  onOpenDemo(): void;
  onOpenProject(project: Project): void;
  onRenameProject(project: Project): void;
}

function UpdatedAt({ timestamp }: { timestamp: number }) {
  const { locale, t } = useLocalization();
  if (timestamp <= 1) return <span>{t('home.demoWorkspace')}</span>;
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(timestamp);
  return <span>{t('home.updated', { date })}</span>;
}

/** Project launcher only expresses user intent; persistence remains in the app adapter. */
export function ProjectHome({
  projects,
  loading,
  demoOpening = false,
  importBusy = false,
  onImportProject,
  coverUrls = {},
  onCreateProject,
  onDeleteProject,
  onOpenDemo,
  onOpenProject,
  onRenameProject,
}: ProjectHomeProps) {
  const { locale, t } = useLocalization();
  const displayProjectName = (project: Project) => translateDemoLabel(locale, project.name);
  return (
    <main aria-label={t('home.newProject')} className="project-home">
      <header className="project-home__header">
        <div className="project-home__container project-home__header-inner">
          <BrandLogo className="brand-logo brand-logo--header" variant="light" />
          <div className="project-home__header-actions">
            <LanguageSelector compact />
            <span className="project-home__edition">{t('home.edition')}</span>
          </div>
        </div>
      </header>
      <section className="project-home__hero">
        <div className="project-home__container project-home__hero-content">
          <div>
            <h1>{t('home.title')}</h1>
            <p>{t('home.description')}</p>
            <div className="project-home__hero-actions">
              {onImportProject ? (
                <button
                  className="button--secondary"
                  disabled={importBusy}
                  onClick={onImportProject}
                  type="button"
                >
                  {t('workspace.import')}
                </button>
              ) : null}
              <button className="button--primary" onClick={onCreateProject} type="button">
                {t('home.newProject')}
              </button>
              <button
                className="button--secondary"
                disabled={demoOpening}
                onClick={onOpenDemo}
                type="button"
              >
                {demoOpening ? t('home.openingDemo') : t('home.openDemo')}
              </button>
            </div>
          </div>
        </div>
      </section>
      <section aria-labelledby="recent-projects-title" className="project-home__recent">
        <div className="project-home__container">
          <div className="section-heading">
            <div>
              <h2 id="recent-projects-title">{t('home.recentProjects')}</h2>
              <p>{t('home.savedLocally')}</p>
            </div>
            <button className="button--secondary" onClick={onCreateProject} type="button">
              + {t('home.newProject')}
            </button>
          </div>
          {loading ? <p className="project-home__empty">{t('home.loadingProjects')}</p> : null}
          {!loading && !projects.length ? (
            <div className="project-home__empty">
              <BrandLogo className="brand-logo brand-logo--empty" variant="icon" />
              <strong>{t('home.emptyTitle')}</strong>
              <p>{t('home.emptyDescription')}</p>
              <button
                className="button--secondary"
                disabled={demoOpening}
                onClick={onOpenDemo}
                type="button"
              >
                {demoOpening ? t('home.openingDemo') : t('home.openDemo')}
              </button>
            </div>
          ) : null}
          {projects.length ? (
            <div className="project-list">
              {projects.map((project) => (
                <article className="project-row" key={project.id}>
                  <button
                    aria-label={`${t('home.openProject')}: ${displayProjectName(project)}`}
                    className="project-row__open"
                    onClick={() => onOpenProject(project)}
                    type="button"
                  >
                    <span className="project-card__visual">
                      {coverUrls[project.id] ? (
                        <img alt="" src={coverUrls[project.id]} />
                      ) : (
                        <BrandLogo
                          aria-hidden="true"
                          className="brand-logo brand-logo--project-icon"
                          variant="icon"
                        />
                      )}
                    </span>
                    <span className="project-card__content">
                      <strong>{displayProjectName(project)}</strong>
                      <UpdatedAt timestamp={project.updatedAt} />
                      <small>
                        {project.boardIds.length === 1
                          ? t('home.boards', { count: project.boardIds.length })
                          : t('home.boardsPlural', { count: project.boardIds.length })}
                      </small>
                    </span>
                  </button>
                  <div className="project-row__actions">
                    <button onClick={() => onRenameProject(project)} type="button">
                      {t('common.rename')}
                    </button>
                    <button onClick={() => onDeleteProject(project)} type="button">
                      {t('common.delete')}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : null}
        </div>
      </section>
      <footer className="project-home__footer">
        <div className="project-home__container project-home__footer-inner">
          <span>{t('home.footerWorkspaces')}</span>
          <span>{t('home.footerAutosave')}</span>
        </div>
      </footer>
    </main>
  );
}
