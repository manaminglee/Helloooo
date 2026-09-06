import { useEffect, useRef, useState } from 'react';
import { CssGiftRenderer } from './CssGiftRenderer';

export function WebGLGiftRenderer({ gift, mode = 'preview', still = false, quality = 'mid' }) {
  const hostRef = useRef(null);
  const sceneId = gift?.scene || gift?.id;
  const [failed, setFailed] = useState(false);
  const ios = typeof document !== 'undefined'
    && (document.documentElement.classList.contains('is-ios')
      || document.documentElement.classList.contains('is-ios-native'));

  useEffect(() => {
    const host = hostRef.current;
    if (!host || still || quality === 'low' || failed) return undefined;
    let disposed = false;
    let renderer;
    let raf = 0;
    let cleanup = () => {};

    (async () => {
      const THREE = await import('three');
      const { createHeroScene, tickHeroScene } = await import('./webglScenes');
      if (disposed || !hostRef.current) return;
      const w = host.clientWidth || 160;
      const h = host.clientHeight || 160;
      try {
        renderer = new THREE.WebGLRenderer({
          antialias: quality === 'high' && !ios,
          alpha: true,
          powerPreference: ios ? 'default' : 'high-performance',
          failIfMajorPerformanceCaveat: false,
        });
      } catch {
        setFailed(true);
        return;
      }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, ios ? 1.5 : quality === 'high' ? 2 : 1.25));
      renderer.setSize(w, h, false);
      renderer.setClearColor(0x000000, 0);
      const onLost = (e) => { e.preventDefault(); setFailed(true); };
      renderer.domElement.addEventListener('webglcontextlost', onLost, false);
      host.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(36, w / h, 0.1, 20);
      camera.position.set(0, 0.35, mode === 'celebration' ? 3.4 : 3.8);
      const { group, extras, envLight, disposeObject } = createHeroScene(sceneId, quality);
      envLight(scene);
      scene.add(group);
      const t0 = performance.now();
      const loop = () => {
        const t = (performance.now() - t0) / 1000;
        group.rotation.y = t * (mode === 'preview' ? 0.35 : 0.55);
        if (mode === 'celebration') {
          camera.position.z = 3.6 - Math.min(0.7, t * 0.18);
          camera.position.y = 0.25 + Math.sin(t * 0.7) * 0.08;
        }
        tickHeroScene(extras, t, sceneId);
        renderer.render(scene, camera);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
      cleanup = () => {
        cancelAnimationFrame(raf);
        disposeObject(group);
        renderer.dispose();
        renderer.domElement.remove();
      };
    })();

    return () => {
      disposed = true;
      cleanup();
    };
  }, [sceneId, mode, still, quality, ios, failed]);

  if (still || quality === 'low' || failed) {
    return <CssGiftRenderer gift={gift} mode={mode} still={still} quality={quality} size={mode === 'celebration' ? 140 : 64} />;
  }

  return <div ref={hostRef} className={`pg-webgl pg-webgl--${mode}`} />;
}
