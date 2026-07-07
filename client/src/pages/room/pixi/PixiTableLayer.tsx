import { useEffect, useRef } from 'react';
import type { Application } from 'pixi.js';
import type { PixiTableScene } from './tableScene';
import type { ChipAnimationEvent, DealAnimationEvent } from './pixiTableTypes';
import { usePrefersReducedMotion } from './usePrefersReducedMotion';

interface PixiTableLayerProps {
  enabled: boolean;
  dealAnim: DealAnimationEvent;
  chipAnim: ChipAnimationEvent | null;
}

export function PixiTableLayer({ enabled, dealAnim, chipAnim }: PixiTableLayerProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const appRef = useRef<Application | null>(null);
  const sceneRef = useRef<PixiTableScene | null>(null);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (!enabled || reducedMotion || !hostRef.current || appRef.current) return;

    let disposed = false;
    let scene: PixiTableScene | null = null;
    let observer: ResizeObserver | null = null;

    void Promise.all([
      import('pixi.js'),
      import('./tableScene'),
    ]).then(async ([pixi, sceneModule]) => {
      if (disposed || !hostRef.current) return;

      const app = new pixi.Application();
      await app.init({
        resizeTo: hostRef.current,
        backgroundAlpha: 0,
        antialias: true,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        autoDensity: true,
      });

      if (disposed || !hostRef.current) {
        app.destroy(true);
        return;
      }

      hostRef.current.appendChild(app.canvas);
      appRef.current = app;

      scene = sceneModule.createPixiTableScene({
        Container: pixi.Container,
        Graphics: pixi.Graphics,
        ticker: app.ticker,
      });
      sceneRef.current = scene;
      app.stage.addChild(scene.root);

      const resizeScene = () => {
        if (!hostRef.current || !scene) return;
        scene.resize({
          width: hostRef.current.clientWidth,
          height: hostRef.current.clientHeight,
        });
      };

      resizeScene();
      observer = new ResizeObserver(resizeScene);
      observer.observe(hostRef.current);
    });

    return () => {
      disposed = true;
      observer?.disconnect();
      scene?.destroy();
      scene = null;
      sceneRef.current = null;
      appRef.current?.destroy(true);
      appRef.current = null;
    };
  }, [enabled, reducedMotion]);

  useEffect(() => {
    if (!enabled || reducedMotion || dealAnim.key === 0) return;
    sceneRef.current?.playDealAnimation(dealAnim, reducedMotion);
  }, [dealAnim, enabled, reducedMotion]);

  useEffect(() => {
    if (!enabled || reducedMotion || !chipAnim) return;
    sceneRef.current?.playChipAnimation(chipAnim, reducedMotion);
  }, [chipAnim, enabled, reducedMotion]);

  if (!enabled || reducedMotion) return null;
  return <div className="pixi-table-layer" ref={hostRef} aria-hidden="true" />;
}