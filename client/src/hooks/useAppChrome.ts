import { useCallback, useEffect, useState } from 'react';

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export function isStandaloneDisplay() {
  if (typeof window === 'undefined') return false;
  const media = window.matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches;
  const ios = 'standalone' in navigator && (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return media || ios || Boolean(document.fullscreenElement);
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

  useEffect(() => {
    const sync = () => {
      const fs = Boolean(document.fullscreenElement);
      setIsFullscreen(fs);
      const alone = isStandaloneDisplay();
      setStandalone(alone);
      document.documentElement.classList.toggle('standalone-app', alone);
    };
    sync();
    setCanFs(typeof document.documentElement.requestFullscreen === 'function');

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    document.addEventListener('fullscreenchange', sync);
    const mq = window.matchMedia('(display-mode: standalone), (display-mode: fullscreen)');
    mq.addEventListener?.('change', sync);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      document.removeEventListener('fullscreenchange', sync);
      mq.removeEventListener?.('change', sync);
    };
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
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
    showInstall: !standalone,
    showInstallTip,
    setShowInstallTip,
    toggleFullscreen,
    handleInstall,
  };
}
