import type { Project } from '@open-industrial-design/design-model';

// Identify template lineage by board identity, never by a user-editable title.
export function isDemoProject(project: Project) {
  return (
    (project.id === 'local-project' && project.boardIds.includes('local-board')) ||
    project.boardIds.includes(`${project.id}:local-board`)
  );
}

export function partitionDemoProjects(projects: readonly Project[]) {
  const demos = projects
    .filter(isDemoProject)
    .sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
  const primary = demos[0];
  return {
    primary,
    visible: projects.filter((project) => !isDemoProject(project) || project.id === primary?.id),
    previous: demos.slice(1),
  };
}
