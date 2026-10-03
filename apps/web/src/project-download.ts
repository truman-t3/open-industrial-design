export interface ProjectDownload {
  url: string;
  filename: string;
}

/** Keep the URL alive for the visible retry link; the owning UI releases it. */
export function downloadOidProject(file: Blob, projectName: string): ProjectDownload {
  const safeName = Array.from(projectName.trim(), (character) =>
    character.charCodeAt(0) < 32 ? '-' : character,
  )
    .join('')
    .replace(/[<>:"/\\|?*]/g, '-');
  const download = {
    url: URL.createObjectURL(file),
    filename: `${safeName || 'project'}.oidproj`,
  };
  const anchor = document.createElement('a');
  anchor.href = download.url;
  anchor.download = download.filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  return download;
}
