import { useEffect, useRef, useState } from 'react';
import { useLocalization } from '@open-industrial-design/ui';
import manifest from '../../../manifest.json';
import { BrandLogo } from './brand';
import { checkRelease, RELEASE_PAGE } from './release-check';

export function AboutDialog({ onClose }: { onClose(): void }) {
  const { locale } = useLocalization();
  const zh = locale === 'zh-CN';
  const dialog = useRef<HTMLDialogElement>(null);
  const controller = useRef<AbortController | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ version: string; newer: boolean }>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => {
      controller.current?.abort();
      element?.close();
    };
  }, []);
  const check = async () => {
    if (busy) return;
    const request = new AbortController();
    controller.current = request;
    const timer = window.setTimeout(() => request.abort(), 12000);
    setBusy(true);
    setFailed(false);
    setResult(undefined);
    try {
      setResult(await checkRelease(manifest.version, request.signal));
    } catch {
      setFailed(true);
    } finally {
      window.clearTimeout(timer);
      setBusy(false);
    }
  };
  return (
    <dialog ref={dialog} className="about-dialog" onCancel={onClose} aria-labelledby="about-title">
      <header>
        <h2 id="about-title">{zh ? '关于与更新' : 'About & updates'}</h2>
        <button type="button" onClick={onClose}>
          {zh ? '关闭' : 'Close'}
        </button>
      </header>
      <BrandLogo variant="light" className="about-dialog__logo" />
      <p className="about-dialog__version">Public Beta · {manifest.version}</p>
      <p>
        {zh
          ? '本地优先的工业设计探索工作台。AI 功能需用户自备 API Key，不内置密钥或提供共享额度。'
          : 'A local-first industrial design workspace. AI features require your own API key; no keys or shared credits are included.'}
      </p>
      <p>
        {zh
          ? '仅在点击时查询 GitHub 公开版本信息，不发送工程或 API 配置。更新由你下载并安装，不会自动覆盖程序。'
          : 'Checks public GitHub release metadata only when requested. No projects or API settings are sent. Updates are downloaded and installed manually.'}
      </p>
      <div className="about-dialog__actions">
        <button
          type="button"
          className="button--primary"
          disabled={busy}
          onClick={() => void check()}
        >
          {busy ? (zh ? '正在检查…' : 'Checking…') : zh ? '检查更新' : 'Check for updates'}
        </button>
        <a href={RELEASE_PAGE} rel="noreferrer">
          {zh ? '官方发布与下载' : 'Official releases & downloads'}
        </a>
      </div>
      <p role="status">
        {failed
          ? zh
            ? '暂时无法检查，请重试或访问官方发布页。'
            : 'Unable to check. Retry or visit the official releases page.'
          : result
            ? result.newer
              ? zh
                ? `发现新版本 ${result.version}`
                : `New version available: ${result.version}`
              : zh
                ? `当前版本不低于最新发布 ${result.version}`
                : `Your version is at least as recent as ${result.version}`
            : ''}
      </p>
      <small>MPL-2.0 · Open Industrial Design</small>
    </dialog>
  );
}
