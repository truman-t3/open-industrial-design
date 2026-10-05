// SPDX-License-Identifier: MPL-2.0
import { readFileSync, copyFileSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const desktop = join(root, 'apps/desktop');
const version = JSON.parse(readFileSync(join(root, 'package.json'))).version;
const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: root,
  encoding: 'utf8',
  windowsHide: true,
}).trim();
const report = JSON.parse(readFileSync(join(desktop, 'native-review/native-notices.json')));
if (
  !report.packages.length ||
  report.packages.some((item) => item.warnings.length || !item.notices.length)
)
  throw new Error('Incomplete native notices');
const output = join(desktop, 'windows-package');
// Refuse stale/foreign output, rather than recursively removing anything.
mkdirSync(output);
const portable = join(output, `Open-Industrial-Design-${version}-portable-x64`);
mkdirSync(portable);
const release = join(desktop, 'src-tauri/target/release');
const engines = readdirSync(join(release, 'bundle/nsis')).filter((file) => file.endsWith('.exe'));
if (engines.length !== 1) throw new Error('Expected one standard installer');
copyFileSync(
  join(release, 'bundle/nsis', engines[0]),
  join(output, `Open-Industrial-Design-${version}-standard-setup.exe`),
);
copyFileSync(
  join(release, 'oid-setup.exe'),
  join(output, `Open-Industrial-Design-${version}-blueprint-setup.exe`),
);
copyFileSync(
  join(release, 'open-industrial-design-desktop.exe'),
  join(portable, 'open-industrial-design-desktop.exe'),
);
writeFileSync(join(portable, 'portable.mode'), 'Open Industrial Design portable v1\n');
for (const folder of [output, portable]) {
  for (const [source, target] of [
    ['LICENSE', 'LICENSE.txt'],
    ['apps/desktop/native-review/NATIVE-NOTICES.txt', 'NATIVE-NOTICES.txt'],
    ['apps/desktop/src-tauri/Cargo.lock', 'Cargo.lock'],
  ])
    copyFileSync(join(root, source), join(folder, target));
  writeFileSync(
    join(folder, 'READ-ME.txt'),
    `Open Industrial Design ${version}\nUnsigned Community Alpha — QA candidate, not a verified public release.\n未签名测试候选包，尚未通过完整安装验收。\n\nBlueprint setup requires Microsoft WebView2. If unavailable, use standard-setup, which can install the runtime.\n蓝图安装器需要 WebView2；缺少该组件时请使用 standard-setup 安装器。\nPortable: extract to a writable dedicated folder; run the EXE. Data stays in Open Industrial Design Data beside it.\n便携版解压到可写独立文件夹运行；数据在旁边的 Open Industrial Design Data 中。升级请保留该数据文件夹。\nDo not bypass Windows security warnings. Verify provenance and hashes first.\n请勿绕过 Windows 安全拦截；先核对来源与哈希。\n\nSource / 源码: https://github.com/truman-t3/open-industrial-design/tree/${commit}\nNative dependencies: see Cargo.lock and NATIVE-NOTICES.txt. Web notices are embedded in the application.\n`,
  );
}
const lines = [];
for (const dir of [output, portable])
  for (const name of readdirSync(dir)) {
    if (name.endsWith('.exe'))
      lines.push(
        `${createHash('sha256')
          .update(readFileSync(join(dir, name)))
          .digest('hex')}  ${dir === portable ? portable.split(/[\\/]/).at(-1) + '/' : ''}${name}`,
      );
  }
writeFileSync(join(output, 'SHA256SUMS.txt'), lines.join('\n') + '\n');
console.log(`Windows QA candidate assembled: ${version} ${commit}`);
