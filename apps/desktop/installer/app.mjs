// SPDX-License-Identifier: MPL-2.0
import {
  idleInstallation,
  beginInstallation,
  receiveInstallerEvent,
  requestCancellation,
} from './installer-state.mjs';
const $ = (id) => document.getElementById(id);
const native = window.__TAURI__;
let state = idleInstallation(),
  language = 'zh',
  connected = false,
  version = '',
  message = '';
const copy = {
  zh: {
    heading: '从蓝图，<br>走向现实。',
    tagline: '一个想法，不止一种可能。',
    motion: '减少动效',
    ready: '准备好，开始你的设计探索。',
    preparing: '正在检查安装环境',
    extracting: '正在准备安装文件',
    installing: '正在安装工作台，请稍候',
    verifying: '正在校验已安装程序',
    complete: '安装完成，开始你的设计探索。',
    cancelled: '已取消，尚未开始写入程序。',
    failed: '安装未完成，请检查后重试。',
    start: '安装工作台',
    launch: '开始设计',
    busy: '安装进行中',
    cancel: '取消',
    cancelling: '正在取消，请稍候',
    retry: '重试安装',
    destination: '程序安装位置',
    license: '许可与数据说明',
    notice: '未签名测试版',
    detail: '开始写入程序后不能中断。完成后可以卸载，工程数据保留。',
    data: '程序按 MPL-2.0 提供。项目存放在独立用户目录；本安装程序不会导入、迁移或删除旧版本项目及 API 配置。此包未经代码签名。',
    host: '请从 Windows 安装程序打开此界面；浏览器预览不会安装软件。',
    errors: {
      'invalid-target': '请选择本机的有效独立文件夹，不支持链接或网络路径。',
      'unowned-target': '此文件夹已有其他内容，请换一个空文件夹。',
      'permission-denied': '没有写入权限，请更换安装位置。',
      'disk-full': '写入失败，请检查可用空间。',
      'engine-failed': '安装执行失败。已有工程未被本程序删除。',
      'verification-failed': '安装后的文件校验未通过，已禁止启动。',
      'launch-failed': '无法启动程序，请检查安装位置。',
    },
  },
  en: {
    heading: 'From blueprint<br>to reality.',
    tagline: 'One idea. Endless possibilities.',
    motion: 'Reduce motion',
    ready: 'Ready for your next design exploration.',
    preparing: 'Checking installation requirements',
    extracting: 'Preparing installation files',
    installing: 'Installing the workspace. Please wait.',
    verifying: 'Verifying installed files',
    complete: 'Installation complete. Start exploring.',
    cancelled: 'Cancelled before installation began.',
    failed: 'Installation did not finish. Check and retry.',
    start: 'Install workspace',
    launch: 'Start designing',
    busy: 'Installing',
    cancel: 'Cancel',
    cancelling: 'Cancelling. Please wait.',
    retry: 'Retry installation',
    destination: 'Application location',
    license: 'License and data',
    notice: 'Unsigned Alpha',
    detail:
      'Writing the application cannot be interrupted. Uninstall later if needed; project data is retained.',
    data: 'Provided under MPL-2.0. Projects are stored in a separate user directory. This installer does not import, migrate or delete previous project data or API settings. This package is unsigned.',
    host: 'Open this screen through the Windows installer. A browser preview cannot install software.',
    errors: {
      'invalid-target': 'Choose a dedicated local folder, not a linked or network path.',
      'unowned-target': 'This folder contains other files. Choose an empty folder.',
      'permission-denied': 'Cannot write here. Choose another installation location.',
      'disk-full': 'Writing failed. Check available space.',
      'engine-failed': 'Installation failed. This host did not delete existing projects.',
      'verification-failed': 'Installed file verification failed. Launch is blocked.',
      'launch-failed': 'Could not launch the application. Check its location.',
    },
  },
};
function render() {
  const t = copy[language],
    active = ['running', 'cancelling'].includes(state.phase);
  document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
  document.body.dataset.phase = active ? 'installing' : state.phase;
  document.body.style.setProperty('--reveal', state.phase === 'complete' ? '100%' : '0%');
  $('heading').innerHTML = t.heading;
  $('tagline').textContent = t.tagline;
  $('motion-label').textContent = t.motion;
  $('stage-idea').textContent = language === 'zh' ? '构思' : 'IDEA';
  $('stage-form').textContent = language === 'zh' ? '成形' : 'FORM';
  $('stage-design').textContent = language === 'zh' ? '开始设计' : 'DESIGN';
  $('destination-label').textContent = t.destination;
  $('destination').disabled = !connected || active || state.phase === 'complete';
  $('license-label').textContent = t.license;
  $('data-notice').textContent = t.data;
  $('notice').textContent = `${t.notice} ${version} · Open Industrial Design`;
  $('status').textContent = !connected
    ? t.host
    : state.phase === 'idle'
      ? t.ready
      : state.phase === 'running'
        ? t[state.stage]
        : t[state.phase];
  $('detail').textContent = message ? (t.errors[message] ?? t.failed) : t.detail;
  $('primary').textContent =
    state.phase === 'complete'
      ? t.launch
      : active
        ? t.busy
        : state.phase === 'idle'
          ? t.start
          : t.retry;
  $('primary').disabled = !connected || active;
  $('cancel').hidden = !active || !state.canCancel;
  $('cancel').textContent = t.cancel;
  $('progress').setAttribute('aria-label', t[state.stage] ?? t.ready);
  if (state.percent === null && active) $('progress').removeAttribute('value');
  else $('progress').value = state.percent ?? 0;
  $('percent').textContent = state.percent === null ? '—' : `${state.percent}%`;
}
$('primary').addEventListener('click', async () => {
  if (!connected) return;
  if (state.launchAllowed) {
    try {
      await native.core.invoke('launch_installed');
    } catch {
      message = 'launch-failed';
      render();
    }
    return;
  }
  const runId = crypto.randomUUID();
  state = beginInstallation(state, runId);
  message = '';
  render();
  try {
    await native.core.invoke('install', { runId, destination: $('destination').value });
    state = receiveInstallerEvent(state, {
      type: 'exit',
      runId,
      sequence: state.sequence + 1,
      code: 0,
      verified: true,
    });
  } catch (error) {
    const code = typeof error === 'string' ? error : 'engine-failed';
    if (code === 'cancelled') state = requestCancellation(state);
    state = receiveInstallerEvent(state, {
      type: 'exit',
      runId,
      sequence: state.sequence + 1,
      code: 1,
      cancelled: code === 'cancelled',
      error: code,
    });
    message =
      code === 'cancelled' ? '' : Object.hasOwn(copy.zh.errors, code) ? code : 'engine-failed';
  }
  render();
});
$('cancel').addEventListener('click', async () => {
  if (await native.core.invoke('cancel_install')) state = requestCancellation(state);
  render();
});
$('language').addEventListener('change', (event) => {
  language = event.target.value;
  render();
});
$('motion').checked = matchMedia('(prefers-reduced-motion: reduce)').matches;
$('motion').addEventListener('change', (event) =>
  document.body.classList.toggle('reduced', event.target.checked),
);
document.body.classList.toggle('reduced', $('motion').checked);
render();
if (native?.core?.invoke && native?.event?.listen) {
  try {
    await native.event.listen(
      'installer-progress',
      ({ payload: [runId, sequence, stage, completed, total] }) => {
        state = receiveInstallerEvent(state, {
          type: 'stage',
          runId,
          sequence: sequence * 2,
          stage,
          cancellable: stage === 'preparing' || stage === 'extracting',
        });
        if (total > 0)
          state = receiveInstallerEvent(state, {
            type: 'progress',
            runId,
            sequence: sequence * 2 + 1,
            stage,
            completed,
            total,
          });
        render();
      },
    );
    const config = await native.core.invoke('configuration');
    $('destination').value = config[0];
    version = config[1];
    connected = true;
    $('license').textContent = await (await fetch('LICENSE.txt')).text();
  } catch {
    connected = false;
  }
  render();
}
