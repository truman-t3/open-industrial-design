/** Persist editable content, never the editor's transient UI or collaborator state. */
export function parseSketchScene(source: string) {
  const scene = JSON.parse(source);
  if (
    !scene ||
    scene.type !== 'excalidraw' ||
    scene.version !== 2 ||
    !Array.isArray(scene.elements)
  ) {
    throw new Error('Invalid sketch scene.');
  }
  return {
    elements: scene.elements,
    files:
      scene.files && typeof scene.files === 'object' && !Array.isArray(scene.files)
        ? scene.files
        : {},
    appState: {
      viewBackgroundColor:
        typeof scene.appState?.viewBackgroundColor === 'string'
          ? scene.appState.viewBackgroundColor
          : '#ffffff',
    },
  };
}

export function serializeSketchScene(
  elements: readonly unknown[],
  files: unknown,
  viewBackgroundColor: string,
): string {
  return JSON.stringify({
    type: 'excalidraw',
    version: 2,
    elements,
    files: files ?? {},
    appState: { viewBackgroundColor },
  });
}
