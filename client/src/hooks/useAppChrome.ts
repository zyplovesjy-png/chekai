import { useCallback, useEffect, useRef, useState } from 'react';

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export function isStandaloneDisplay() {
  if (typeof window === 'undefined') return false;
  const media = window.matchMedia('(display-mode: standalone)').matches;
  const ios = 'standalone' in navigator && (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return media || ios;
}

type LockableScreenOrientation = ScreenOrientation & {
  lock?: (orientation: 'portrait-primary') => Promise<void>;
};

function getScreenOrientation() {
  if (typeof screen === 'undefined' || !screen.orientation) return null;
  return screen.orientation as LockableScreenOrientation;
}

function unlockScreenOrientation() {
  try { getScreenOrientation()?.unlock?.(); } catch { /* unsupported orientation unlock */ }
}

export function isIosSafari() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const webkit = /WebKit/.test(ua);
  const chrome = /CriOS|FxiOS|EdgiOS/.test(ua);
  return iOS && webkit && !chrome;
}

export function useAppChrome() {
  const [standalone, setStandalone] = useState(isStandaloneDisplay);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [canFs, setCanFs] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstallTip, setShowInstallTip] = useState(false);
  const orientationLockedRef = useRef(false);

  useEffect(() => {
    const sync = () => {
      const fs = Boolean(document.fullscreenElement);
      setIsFullscreen(fs);
      if (!fs && orientationLockedRef.current) {
        unlockScreenOrientation();
        orientationLockedRef.current = false;
      }
      const alone = isStandaloneDisplay();
      setStandalone(alone);
      document.documentElement.classList.toggle('standalone-app', alone || fs);
    };
    sync();
    setCanFs(typeof document.documentElement.requestFullscreen === 'function');

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    document.addEventListener('fullscreenchange', sync);
    const mq = window.matchMedia('(display-mode: standalone)');
    mq.addEventListener?.('change', sync);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      document.removeEventListener('fullscreenchange', sync);
      mq.removeEventListener?.('change', sync);
      if (orientationLockedRef.current) {
        unlockScreenOrientation();
        orientationLockedRef.current = false;
      }
    };
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        unlockScreenOrientation();
        orientationLockedRef.current = false;
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
        try {
          const orientation = getScreenOrientation();
          if (orientation?.lock) {
            await orientation.lock('portrait-primary');
            orientationLockedRef.current = true;
          }
        } catch { /* keep responsive fallback */ }
      }
    } catch {
      // iOS Safari 等可能不支持
    }
  }, []);

  const handleInstall = useCallback(async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      return;
    }
    setShowInstallTip(true);
  }, [deferredPrompt]);

  return {
    standalone,
    isFullscreen,
    canFs,
    showFs: canFs && !standalone,
    showInstall: !standalone && !isFullscreen,
    showInstallTip,
    setShowInstallTip,
    toggleFullscreen,
    handleInstall,
  };
}
