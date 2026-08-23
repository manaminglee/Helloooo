import React, { useEffect, useRef } from 'react';

/**
 * Real racing visuals on a 2D canvas — perspective road, scrolling lane
 * markings, drawn cars with boost flames, nitro trails and finish banner.
 *
 * Rendering is fully decoupled from networking: the server sends authoritative
 * progress ~10x/sec and this canvas interpolates between the last two samples
 * at 60fps, so motion looks smooth without ever inventing positions.
 */

const CAR_BODY = [
  [0, -14], [7, -9], [8, 2], [6, 14], [-6, 14], [-8, 2], [-7, -9],
];

function drawCar(ctx, x, y, color, boosting, scale = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  // Nitro flame behind the car
  if (boosting) {
    const flame = ctx.createLinearGradient(0, 14, 0, 40);
    flame.addColorStop(0, 'rgba(251,191,36,0.95)');
    flame.addColorStop(0.5, 'rgba(249,115,22,0.6)');
    flame.addColorStop(1, 'rgba(239,68,68,0)');
    ctx.fillStyle = flame;
    ctx.beginPath();
    ctx.moveTo(-5, 13);
    ctx.lineTo(5, 13);
    ctx.lineTo(2 + Math.random() * 2, 30 + Math.random() * 10);
    ctx.lineTo(-2 - Math.random() * 2, 30 + Math.random() * 10);
    ctx.closePath();
    ctx.fill();
  }

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(0, 15, 9, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // Body
  ctx.fillStyle = color;
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  CAR_BODY.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Windshield
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.beginPath();
  ctx.moveTo(-4.5, -6);
  ctx.lineTo(4.5, -6);
  ctx.lineTo(3.5, 0);
  ctx.lineTo(-3.5, 0);
  ctx.closePath();
  ctx.fill();

  // Wheels
  ctx.fillStyle = '#111';
  [[-8, -7], [8, -7], [-8, 8], [8, 8]].forEach(([wx, wy]) => {
    ctx.fillRect(wx - 2, wy - 3.5, 4, 7);
  });

  // Boost rim light
  if (boosting) {
    ctx.strokeStyle = 'rgba(251,191,36,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    CAR_BODY.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
    ctx.closePath();
    ctx.stroke();
  }

  ctx.restore();
}

export default function RaceTrackCanvas({ players = [], trackLength = 1000, status, mySocketId, height = 260 }) {
  const canvasRef = useRef(null);
  // socketId -> { prev, next, prevT, nextT, boosting } for interpolation
  const samplesRef = useRef(new Map());
  const playersRef = useRef(players);
  const statusRef = useRef(status);
  const scrollRef = useRef(0);

  // Record a new authoritative sample whenever server data changes.
  useEffect(() => {
    const now = performance.now();
    const map = samplesRef.current;
    players.forEach((p) => {
      const cur = map.get(p.socketId);
      const progress = Number(p.progress) || 0;
      if (!cur) {
        map.set(p.socketId, { prev: progress, next: progress, prevT: now, nextT: now, boosting: p.boosting });
      } else if (progress !== cur.next) {
        cur.prev = cur.next;
        cur.prevT = cur.nextT;
        cur.next = progress;
        cur.nextT = now;
        cur.boosting = p.boosting;
      } else {
        cur.boosting = p.boosting;
      }
    });
    // Drop players who left.
    const ids = new Set(players.map((p) => p.socketId));
    [...map.keys()].forEach((k) => {
      if (!ids.has(k)) map.delete(k);
    });
    playersRef.current = players;
    statusRef.current = status;
  }, [players, status]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    let raf = 0;
    let running = true;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth || 320;
      canvas.width = w * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const render = () => {
      if (!running) return;
      const W = canvas.clientWidth || 320;
      const H = height;
      const now = performance.now();
      const list = playersRef.current;
      const racing = statusRef.current === 'racing';

      ctx.clearRect(0, 0, W, H);

      // ---- sky / backdrop ----
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#131627');
      sky.addColorStop(0.45, '#1b1533');
      sky.addColorStop(1, '#0b0d16');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);

      const horizon = H * 0.26;

      // Distant city glow
      ctx.fillStyle = 'rgba(139,92,246,0.10)';
      for (let i = 0; i < 14; i += 1) {
        const bw = 12 + ((i * 37) % 26);
        const bh = 10 + ((i * 53) % 34);
        ctx.fillRect((i * W) / 14, horizon - bh, bw, bh);
      }

      // ---- perspective road ----
      const roadTopW = W * 0.24;
      const roadBotW = W * 0.96;
      ctx.fillStyle = '#23262f';
      ctx.beginPath();
      ctx.moveTo(W / 2 - roadTopW / 2, horizon);
      ctx.lineTo(W / 2 + roadTopW / 2, horizon);
      ctx.lineTo(W / 2 + roadBotW / 2, H);
      ctx.lineTo(W / 2 - roadBotW / 2, H);
      ctx.closePath();
      ctx.fill();

      // Road edges
      ctx.strokeStyle = 'rgba(139,92,246,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(W / 2 - roadTopW / 2, horizon);
      ctx.lineTo(W / 2 - roadBotW / 2, H);
      ctx.moveTo(W / 2 + roadTopW / 2, horizon);
      ctx.lineTo(W / 2 + roadBotW / 2, H);
      ctx.stroke();

      // Scrolling lane dashes — speed conveys motion while racing
      if (racing) scrollRef.current = (scrollRef.current + 0.022) % 1;
      const seg = 9;
      for (let i = 0; i < seg; i += 1) {
        const t0 = ((i + scrollRef.current) % seg) / seg;
        const t1 = t0 + 0.045;
        if (t1 > 1) continue;
        // Non-linear so dashes bunch toward the horizon (perspective)
        const y0 = horizon + (H - horizon) * t0 * t0;
        const y1 = horizon + (H - horizon) * t1 * t1;
        const w0 = 1 + 4 * t0 * t0;
        const w1 = 1 + 4 * t1 * t1;
        ctx.fillStyle = 'rgba(255,255,255,0.42)';
        ctx.beginPath();
        ctx.moveTo(W / 2 - w0, y0);
        ctx.lineTo(W / 2 + w0, y0);
        ctx.lineTo(W / 2 + w1, y1);
        ctx.lineTo(W / 2 - w1, y1);
        ctx.closePath();
        ctx.fill();
      }

      // ---- lanes & cars ----
      const n = Math.max(list.length, 1);
      const laneTop = H * 0.42;
      const laneBottom = H - 26;
      const laneH = (laneBottom - laneTop) / n;

      list.forEach((p, i) => {
        const s = samplesRef.current.get(p.socketId);
        let progress = Number(p.progress) || 0;
        if (s) {
          // Interpolate between the last two server samples.
          const span = Math.max(s.nextT - s.prevT, 1);
          const k = Math.min((now - s.nextT) / span + 1, 1.35);
          progress = s.prev + (s.next - s.prev) * Math.min(k, 1);
        }
        const pct = Math.max(0, Math.min(1, progress / trackLength));

        const y = laneTop + laneH * i + laneH / 2;
        // Depth scale: further lanes (top) render slightly smaller
        const depth = 0.72 + 0.4 * (i / n);
        const marginL = W * 0.08;
        const marginR = W * 0.9;
        const x = marginL + (marginR - marginL) * pct;

        // Lane guide
        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(marginL, y + 16 * depth);
        ctx.lineTo(marginR, y + 16 * depth);
        ctx.stroke();

        // Speed trail
        if (s?.boosting) {
          const trail = ctx.createLinearGradient(x - 60, y, x, y);
          trail.addColorStop(0, 'rgba(251,191,36,0)');
          trail.addColorStop(1, 'rgba(251,191,36,0.4)');
          ctx.strokeStyle = trail;
          ctx.lineWidth = 5 * depth;
          ctx.beginPath();
          ctx.moveTo(x - 60, y);
          ctx.lineTo(x, y);
          ctx.stroke();
        }

        drawCar(ctx, x, y, p.car?.color || '#8b5cf6', !!s?.boosting, depth);

        // Name tag
        ctx.font = `600 ${Math.round(10 * depth + 1)}px system-ui, sans-serif`;
        ctx.fillStyle = p.socketId === mySocketId ? 'rgba(251,191,36,0.95)' : 'rgba(255,255,255,0.6)';
        ctx.textAlign = 'center';
        ctx.fillText(p.socketId === mySocketId ? 'YOU' : (p.nickname || '').slice(0, 8), x, y - 20 * depth);

        // Placement badge
        if (p.finished && p.place) {
          ctx.font = `800 ${Math.round(11 * depth + 2)}px system-ui, sans-serif`;
          ctx.fillStyle = ['#fbbf24', '#cbd5e1', '#f97316'][p.place - 1] || 'rgba(255,255,255,0.5)';
          ctx.fillText(`#${p.place}`, x + 20 * depth, y + 4);
        }
      });

      // ---- finish line ----
      const fx = W * 0.9;
      const sq = 6;
      for (let r = 0; r < Math.ceil((H - laneTop + 20) / sq); r += 1) {
        for (let c = 0; c < 2; c += 1) {
          ctx.fillStyle = (r + c) % 2 === 0 ? 'rgba(255,255,255,0.85)' : 'rgba(20,20,25,0.85)';
          ctx.fillRect(fx + c * sq, laneTop - 20 + r * sq, sq, sq);
        }
      }

      // Vignette for depth
      const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.85);
      vig.addColorStop(0, 'rgba(0,0,0,0)');
      vig.addColorStop(1, 'rgba(0,0,0,0.5)');
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, W, H);

      raf = requestAnimationFrame(render);
    };

    raf = requestAnimationFrame(render);

    const onVis = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(raf);
      } else {
        running = true;
        raf = requestAnimationFrame(render);
      }
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('resize', resize);
    };
  }, [height, trackLength, mySocketId]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full block rounded-xl"
      style={{ height }}
      aria-label="Race track"
    />
  );
}
