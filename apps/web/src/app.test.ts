import { describe, expect, it } from 'vitest';
import { appMetadata, translate } from '@open-industrial-design/core';

describe('application metadata', () => {
  it('centralizes the public name and portable project extension', () => {
    expect(appMetadata.displayName).toBe('Open Industrial Design');
    expect(appMetadata.projectFileExtension).toBe('.oidproj');
  });

  it('provides Chinese and English guidance for the empty 3D workspace', () => {
    expect(translate('zh-CN', 'threeD.empty')).toBe(
      '导入 GLB / GLTF 模型，或在工作区中选择 3D 卡片后在这里打开。',
    );
    expect(translate('en', 'threeD.empty')).toContain('Import a GLB / GLTF model');
  });
});
