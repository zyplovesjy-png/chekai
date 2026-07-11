import { isIosSafari, useAppChrome } from '@/hooks/useAppChrome';

/** 安装说明弹层（全屏/安装共用） */
export function AppInstallTip({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="app-install-tip" role="dialog" aria-label="安装说明">
      <div>
        <strong>添加到主屏幕</strong>
        {isIosSafari() ? (
          <p style={{ marginTop: 8 }}>
            点击底部分享按钮（□↑），再选择「添加到主屏幕」，即可去掉网址栏、全屏使用。
          </p>
        ) : (
          <p style={{ marginTop: 8 }}>
            请用系统浏览器菜单中的「安装应用」或「添加到主屏幕」。若看不到该选项，可用 Chrome / Edge 打开本页后再试。
          </p>
        )}
      </div>
      <div className="tip-actions">
        <button type="button" className="btn" onClick={onClose}>知道了</button>
      </div>
    </div>
  );
}

/** 房间顶栏：全屏 / 安装图标，放在菜单按钮旁 */
export function RoomChromeIcons() {
  const {
    showFs,
    showInstall,
    isFullscreen,
    showInstallTip,
    setShowInstallTip,
    toggleFullscreen,
    handleInstall,
  } = useAppChrome();

  if (!showFs && !showInstall && !showInstallTip) return null;

  return (
    <>
      {showFs && (
        <button
          type="button"
          className="tea-menu-btn tea-chrome-btn"
          aria-label={isFullscreen ? '退出全屏' : '全屏'}
          title={isFullscreen ? '退出全屏' : '全屏'}
          onClick={toggleFullscreen}
        >
          {isFullscreen ? <IconExitFullscreen /> : <IconFullscreen />}
        </button>
      )}
      {showInstall && (
        <button
          type="button"
          className="tea-menu-btn tea-chrome-btn"
          aria-label="添加到主屏幕"
          title="添加到主屏幕"
          onClick={handleInstall}
        >
          <IconInstall />
        </button>
      )}
      <AppInstallTip open={showInstallTip} onClose={() => setShowInstallTip(false)} />
    </>
  );
}

function IconFullscreen() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3H4v4M16 3h4v4M8 21H4v-4M16 21h4v-4" />
    </svg>
  );
}

function IconExitFullscreen() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 3v6H3M15 3v6h6M9 21v-6H3M15 21v-6h6" />
    </svg>
  );
}

function IconInstall() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="6" y="3" width="12" height="18" rx="2.5" />
      <path d="M12 8v7M9.5 12.5 12 15l2.5-2.5" />
    </svg>
  );
}
