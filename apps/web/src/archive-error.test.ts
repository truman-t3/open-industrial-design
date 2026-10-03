import { describe, expect, it } from 'vitest';
import {
  ProjectArchiveError,
  type ProjectArchiveErrorCode,
} from '@open-industrial-design/project-file';
import { archiveErrorMessage } from './archive-error';

const codes: ProjectArchiveErrorCode[] = [
  'project_conflict',
  'archive_too_large',
  'corrupt_archive',
  'invalid_archive_path',
  'invalid_manifest',
  'unsupported_schema_version',
  'invalid_project_data',
  'missing_asset_blob',
  'unsupported_asset_storage',
  'secrets_not_allowed',
];

describe('portable project error guidance', () => {
  it.each(codes)('localizes %s without displaying raw diagnostic content', (code) => {
    const error = new ProjectArchiveError(code, 'private diagnostic value');
    const chinese = archiveErrorMessage(error, 'zh-CN');
    const english = archiveErrorMessage(error, 'en');
    expect(chinese).toMatch(/[\u4e00-\u9fff]/);
    expect(english).toMatch(/[a-z]/i);
    expect(chinese).not.toBe(english);
    expect(chinese + english).not.toContain('private diagnostic');
    expect(chinese + english).not.toContain('archive.error.');
  });
  it('provides safe fallback guidance for storage and unknown failures', () => {
    expect(archiveErrorMessage(new Error('private diagnostic value'), 'zh-CN')).toContain(
      '未能完成',
    );
    expect(archiveErrorMessage(undefined, 'en')).toContain('could not be completed');
  });
});
