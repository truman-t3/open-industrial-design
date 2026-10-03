import { translate, type AppLocale, type MessageKey } from '@open-industrial-design/core';
import {
  ProjectArchiveError,
  type ProjectArchiveErrorCode,
} from '@open-industrial-design/project-file';

const messages = {
  project_conflict: 'archive.error.conflict',
  archive_too_large: 'archive.error.tooLarge',
  corrupt_archive: 'archive.error.corrupt',
  invalid_archive_path: 'archive.error.path',
  invalid_manifest: 'archive.error.manifest',
  unsupported_schema_version: 'archive.error.version',
  invalid_project_data: 'archive.error.data',
  missing_asset_blob: 'archive.error.missingAsset',
  unsupported_asset_storage: 'archive.error.storage',
  secrets_not_allowed: 'archive.error.secrets',
} satisfies Record<ProjectArchiveErrorCode, MessageKey>;

/** User guidance only; archive validation and diagnostic errors remain in the format package. */
export function archiveErrorMessage(error: unknown, locale: AppLocale): string {
  return translate(
    locale,
    error instanceof ProjectArchiveError ? messages[error.code] : 'archive.error.unknown',
  );
}
