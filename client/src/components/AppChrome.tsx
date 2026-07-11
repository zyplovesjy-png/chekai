import { useLocation } from 'react-router-dom';
import { useAppChrome } from '@/hooks/useAppChrome';
import { AppInstallTip } from './AppChromeIcons';

/** 登录/大厅等非房间页的浮动控制；房间页改用顶栏图标 */
export default function AppChrome() {
  const { pathname } = useLocation();
  if (pathname.startsWith('/room') || pathname.startsWith('/layout-lab')) return null;
  return <AppChromeFloating />;
}

function AppChromeFloating() {
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
      <div className="app-chrome-bar" aria-label="显示控制">
        {showFs && (
          <button type="button" className="btn app-chrome-btn" onClick={toggleFullscreen}>
            {isFullscreen ? '退出全屏' : '全屏'}
          </button>
        )}
        {showInstall && (
          <button type="button" className="btn app-chrome-btn app-chrome-install" onClick={handleInstall}>
            添加到主屏幕
          </button>
        )}
      </div>
      <AppInstallTip open={showInstallTip} onClose={() => setShowInstallTip(false)} />
    </>
  );
}
