export const RELEASE_PAGE = 'https://github.com/truman-t3/open-industrial-design/releases';
export const RELEASE_API =
  'https://api.github.com/repos/truman-t3/open-industrial-design/releases/latest';

function versionParts(value: string) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-(alpha|beta|rc)\.(\d+))?$/.exec(value);
  if (!match) throw new Error('Unsupported release version');
  return [
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
    match[4] ? ['alpha', 'beta', 'rc'].indexOf(match[4]) : 3,
    Number(match[5] ?? 0),
  ];
}

export function isNewerRelease(remote: string, current: string) {
  const a = versionParts(remote);
  const b = versionParts(current);
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i]! > b[i]!;
  }
  return false;
}

/** Public metadata only: no provider settings, credentials or project data. */
export async function checkRelease(current: string, signal: AbortSignal) {
  const response = await fetch(RELEASE_API, {
    signal,
    credentials: 'omit',
    cache: 'no-store',
    referrerPolicy: 'no-referrer',
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (!response.ok) throw new Error(`Release check failed (${response.status})`);
  const release: unknown = await response.json();
  if (
    !release ||
    typeof release !== 'object' ||
    !('tag_name' in release) ||
    typeof release.tag_name !== 'string' ||
    ('draft' in release && release.draft !== false)
  )
    throw new Error('Invalid release response');
  return { version: release.tag_name, newer: isNewerRelease(release.tag_name, current) };
}
