import { useEffect, useRef } from 'react';
import { particleCap } from './giftQuality';

const KINDS = {
  sparkle: ['#fde68a', '#fff7ed', '#fbbf24'],
  petal: ['#fb7185', '#f472b6', '#fda4af'],
  coin: ['#fbbf24', '#f59e0b', '#fde68a'],
  crystal: ['#a5f3fc', '#e0f2fe', '#c4b5fd'],
  neon: ['#22d3ee', '#a78bfa', '#f472b6'],
  heart: ['#fb7185', '#f43f5e', '#fda4af'],
};

export function GiftParticles({ kind = 'sparkle', quality = 'mid', active = true, className = '' }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !active) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    const colors = KINDS[kind] || KINDS.sparkle;
    const cap = particleCap(quality);
    let w = canvas.clientWidth;
    let h = canvas.clientHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    const dots = Array.from({ length: cap }, (_, i) => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: 1 + (i % 3),
      vx: (Math.random() - 0.5) * 0.6,
      vy: kind === 'coin' || kind === 'petal' ? 0.4 + Math.random() * 0.8 : (Math.random() - 0.5) * 0.5,
      c: colors[i % colors.length],
      a: 0.3 + Math.random() * 0.6,
    }));

    let raf = 0;
    const loop = () => {
      ctx.clearRect(0, 0, w, h);
      dots.forEach((d) => {
        d.x += d.vx;
        d.y += d.vy;
        if (d.x < 0) d.x = w;
        if (d.x > w) d.x = 0;
        if (d.y > h) d.y = -4;
        if (d.y < -6) d.y = h;
        ctx.globalAlpha = d.a;
        ctx.fillStyle = d.c;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fill();
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [kind, quality, active]);

  return <canvas ref={canvasRef} className={`pg-particles ${className}`.trim()} aria-hidden />;
}
