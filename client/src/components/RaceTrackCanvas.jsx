import React, { useEffect, useRef } from 'react';

/**
 * Highway heist canvas — neon night city, wet asphalt, glowing sports cars.
 * Server sends progress ~10x/sec; we interpolate at 60fps.
 */

function drawSportsCar(ctx, x, y, color, accent, boosting, slowed, scale = 1, t = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.rotate(-0.08);

  if (boosting) {
    const flicker = 0.85 + Math.sin(t * 0.04) * 0.15;
    const flame = ctx.createLinearGradient(-36, 0, -6, 0);
    flame.addColorStop(0, 'rgba(251,191,36,0)');
    flame.addColorStop(0.35, `rgba(249,115,22,${0.65 * flicker})`);
    flame.addColorStop(0.7, `rgba(254,240,138,${0.9 * flicker})`);
    flame.addColorStop(1, 'rgba(255,255,255,0.95)');
    ctx.fillStyle = flame;
    ctx.beginPath();
    ctx.moveTo(-10, -5);
    ctx.lineTo(-10, 5);
    ctx.lineTo(-38 - Math.sin(t * 0.05) * 6, 2);
    ctx.lineTo(-32 - Math.cos(t * 0.05) * 4, -3);
    ctx.closePath();
    ctx.fill();
    for (let i = 0; i < 4; i += 1) {
      ctx.fillStyle = `rgba(251,191,36,${0.35 - i * 0.08})`;
      ctx.beginPath();
      ctx.arc(-22 - i * 7, (Math.sin(t * 0.03 + i) * 3), 2.5 - i * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.beginPath();
  ctx.ellipse(2, 11, 18, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  const bodyGrad = ctx.createLinearGradient(-16, -8, 18, 10);
  bodyGrad.addColorStop(0, color);
  bodyGrad.addColorStop(0.45, color);
  bodyGrad.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.moveTo(-16, 2);
  ctx.quadraticCurveTo(-18, 8, -10, 9);
  ctx.lineTo(12, 9);
  ctx.quadraticCurveTo(20, 8, 18, 2);
  ctx.lineTo(16, -2);
  ctx.quadraticCurveTo(8, -8, -2, -7);
  ctx.lineTo(-12, -4);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 0.8;
  ctx.stroke();

  ctx.fillStyle = accent || 'rgba(180,220,255,0.65)';
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.moveTo(-4, -5);
  ctx.lineTo(8, -5.5);
  ctx.lineTo(10, -1);
  ctx.lineTo(-6, -0.5);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(6, -3, 8, 2);

  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(4, -2, 10, 3);

  [[-10, 7], [10, 7]].forEach(([wx, wy]) => {
    ctx.fillStyle = '#08080a';
    ctx.beginPath();
    ctx.ellipse(wx, wy, 4.5, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = accent || '#94a3b8';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.ellipse(wx, wy, 2.2, 2.4, 0, 0, Math.PI * 2);
    ctx.stroke();
  });

  const headGlow = ctx.createRadialGradient(17, 1, 0, 17, 1, 6);
  headGlow.addColorStop(0, 'rgba(254,249,195,0.95)');
  headGlow.addColorStop(1, 'rgba(254,249,195,0)');
  ctx.fillStyle = headGlow;
  ctx.beginPath();
  ctx.ellipse(17, 1, 6, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fef9c3';
  ctx.beginPath();
  ctx.ellipse(17, 1, 2.2, 1.4, 0, 0, Math.PI * 2);
  ctx.fill();

  if (slowed) {
    ctx.strokeStyle = 'rgba(248,113,113,0.95)';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(-18, -10, 36, 20);
    ctx.setLineDash([]);
  } else if (boosting) {
    ctx.strokeStyle = 'rgba(251,191,36,0.9)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  ctx.restore();
}

function drawCoin(ctx, x, y, value, scale, spin) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale * (0.85 + Math.abs(Math.sin(spin)) * 0.15), scale);
  const g = ctx.createRadialGradient(-2, -2, 1, 0, 0, 10);
  g.addColorStop(0, '#fff7c2');
  g.addColorStop(0.4, '#fde047');
  g.addColorStop(0.75, '#f59e0b');
  g.addColorStop(1, '#92400e');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(120,53,15,0.8)';
  ctx.lineWidth = 1.8;
  ctx.stroke();
  ctx.shadowColor = 'rgba(251,191,36,0.6)';
  ctx.shadowBlur = 8;
  ctx.fillStyle = '#78350f';
  ctx.font = 'bold 8px system-ui,sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(value), 0, 0.5);
  ctx.shadowBlur = 0;
  ctx.restore();
}

function drawHazard(ctx, x, y, scale, pulse) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.shadowColor = 'rgba(249,115,22,0.75)';
  ctx.shadowBlur = 6 + pulse * 8;
  ctx.fillStyle = `rgba(249,115,22,${0.85 + pulse * 0.15})`;
  ctx.beginPath();
  ctx.moveTo(0, -10);
  ctx.lineTo(10, 9);
  ctx.lineTo(-10, 9);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#111';
  ctx.font = 'bold 11px system-ui,sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('!', 0, 5);
  ctx.restore();
}

function drawCityLayer(ctx, W, horizon, cam, layer, color, alpha, speed) {
  const offset = (cam * speed * W) % W;
  ctx.fillStyle = color;
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.moveTo(0, horizon);
  for (let i = -1; i <= Math.ceil(W / layer.w) + 1; i += 1) {
    const bx = i * layer.w - offset;
    const h = layer.heights[i % layer.heights.length];
    ctx.lineTo(bx, horizon - h);
    ctx.lineTo(bx + layer.w * 0.55, horizon - h * 0.92);
    ctx.lineTo(bx + layer.w, horizon - h * 0.75);
  }
  ctx.lineTo(W, horizon);
  ctx.closePath();
  ctx.fill();

  for (let i = -1; i <= Math.ceil(W / layer.w) + 1; i += 1) {
    const bx = i * layer.w - offset + 8;
    const h = layer.heights[i % layer.heights.length];
    for (let w = 0; w < 4; w += 1) {
      if ((i + w) % 3 === 0) {
        ctx.fillStyle = `rgba(254,240,138,${0.15 + ((i + w) % 5) * 0.04})`;
        ctx.fillRect(bx + w * 9, horizon - h * 0.7 + w * 6, 4, 5);
      }
    }
  }
  ctx.globalAlpha = 1;
}

export default function RaceTrackCanvas({
  players = [],
  trackLength = 1200,
  status,
  mySocketId,
  height = 280,
  coins = [],
  hazards = [],
}) {
  const canvasRef = useRef(null);
  const samplesRef = useRef(new Map());
  const playersRef = useRef(players);
  const statusRef = useRef(status);
  const coinsRef = useRef(coins);
  const hazardsRef = useRef(hazards);
  const scrollRef = useRef(0);
  const frameRef = useRef(0);

  const cityFar = useRef({
    w: 72,
    heights: [28, 42, 36, 52, 30, 48, 38, 44],
  });
  const cityNear = useRef({
    w: 96,
    heights: [48, 64, 56, 72, 50, 68, 58, 76],
  });

  useEffect(() => {
    const now = performance.now();
    const map = samplesRef.current;
    players.forEach((p) => {
      const cur = map.get(p.socketId);
      const progress = Number(p.progress) || 0;
      if (!cur) {
        map.set(p.socketId, {
          prev: progress,
          next: progress,
          prevT: now,
          nextT: now,
          boosting: p.boosting,
          slowed: p.slowed,
        });
      } else if (progress !== cur.next) {
        cur.prev = cur.next;
        cur.prevT = cur.nextT;
        cur.next = progress;
        cur.nextT = now;
        cur.boosting = p.boosting;
        cur.slowed = p.slowed;
      } else {
        cur.boosting = p.boosting;
        cur.slowed = p.slowed;
      }
    });
    const ids = new Set(players.map((p) => p.socketId));
    [...map.keys()].forEach((k) => {
      if (!ids.has(k)) map.delete(k);
    });
    playersRef.current = players;
    statusRef.current = status;
    coinsRef.current = coins;
    hazardsRef.current = hazards;
  }, [players, status, coins, hazards]);

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
      frameRef.current += 1;
      const t = frameRef.current;
      const list = playersRef.current;
      const racing = statusRef.current === 'racing';
      const mySample = samplesRef.current.get(mySocketId);
      let myProgress = 0;
      if (mySample) {
        const span = Math.max(mySample.nextT - mySample.prevT, 1);
        const k = Math.min((now - mySample.nextT) / span + 1, 1.2);
        myProgress = mySample.prev + (mySample.next - mySample.prev) * Math.min(k, 1);
      } else if (list[0]) {
        myProgress = Number(list[0].progress) || 0;
      }
      const cam = Math.max(0, Math.min(1, myProgress / trackLength));

      ctx.clearRect(0, 0, W, H);

      const sky = ctx.createLinearGradient(0, 0, 0, H * 0.5);
      sky.addColorStop(0, '#030712');
      sky.addColorStop(0.35, '#0f172a');
      sky.addColorStop(0.7, '#1e1b4b');
      sky.addColorStop(1, '#312e81');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);

      const moonX = W * 0.78;
      const moonY = H * 0.12;
      const moonGlow = ctx.createRadialGradient(moonX, moonY, 0, moonX, moonY, 42);
      moonGlow.addColorStop(0, 'rgba(254,249,195,0.35)');
      moonGlow.addColorStop(0.4, 'rgba(196,181,253,0.12)');
      moonGlow.addColorStop(1, 'rgba(196,181,253,0)');
      ctx.fillStyle = moonGlow;
      ctx.fillRect(0, 0, W, H * 0.45);
      ctx.fillStyle = 'rgba(254,249,195,0.9)';
      ctx.beginPath();
      ctx.arc(moonX, moonY, 14, 0, Math.PI * 2);
      ctx.fill();

      for (let i = 0; i < 40; i += 1) {
        const tw = 0.4 + Math.sin(t * 0.02 + i) * 0.3;
        ctx.fillStyle = `rgba(255,255,255,${0.2 + tw * 0.35})`;
        const sx = ((i * 113 + cam * 30) % W);
        const sy = 6 + (i * 29) % (H * 0.22);
        ctx.fillRect(sx, sy, 1 + tw, 1 + tw);
      }

      const horizon = H * 0.3;
      drawCityLayer(ctx, W, horizon, cam, cityFar.current, '#141028', 0.85, 0.15);
      drawCityLayer(ctx, W, horizon, cam, cityNear.current, '#0c0a18', 1, 0.28);

      const neonColors = ['#f472b6', '#38bdf8', '#a78bfa', '#34d399'];
      for (let i = 0; i < 6; i += 1) {
        const nx = ((i * 140 + t * 0.4) % (W + 80)) - 40;
        ctx.fillStyle = neonColors[i % neonColors.length];
        ctx.globalAlpha = 0.35 + Math.sin(t * 0.03 + i) * 0.15;
        ctx.fillRect(nx, horizon - 22 - (i % 3) * 8, 28, 3);
        ctx.globalAlpha = 1;
      }

      const roadTopW = W * 0.16;
      const roadBotW = W * 1.08;
      const asphalt = ctx.createLinearGradient(0, horizon, 0, H);
      asphalt.addColorStop(0, '#4b5563');
      asphalt.addColorStop(0.35, '#2a2f3a');
      asphalt.addColorStop(1, '#12151c');
      ctx.fillStyle = asphalt;
      ctx.beginPath();
      ctx.moveTo(W / 2 - roadTopW / 2, horizon);
      ctx.lineTo(W / 2 + roadTopW / 2, horizon);
      ctx.lineTo(W / 2 + roadBotW / 2, H + 4);
      ctx.lineTo(W / 2 - roadBotW / 2, H + 4);
      ctx.closePath();
      ctx.fill();

      const wetSheen = ctx.createLinearGradient(W / 2 - roadBotW / 2, horizon, W / 2 + roadBotW / 2, H);
      wetSheen.addColorStop(0, 'rgba(147,197,253,0.06)');
      wetSheen.addColorStop(0.5, 'rgba(255,255,255,0.04)');
      wetSheen.addColorStop(1, 'rgba(147,197,253,0.02)');
      ctx.fillStyle = wetSheen;
      ctx.fill();

      ctx.strokeStyle = 'rgba(248,250,252,0.65)';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(W / 2 - roadTopW / 2, horizon);
      ctx.lineTo(W / 2 - roadBotW / 2, H);
      ctx.moveTo(W / 2 + roadTopW / 2, horizon);
      ctx.lineTo(W / 2 + roadBotW / 2, H);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(59,130,246,0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(W / 2 - roadTopW / 4, horizon);
      ctx.lineTo(W / 2 - roadBotW / 4, H);
      ctx.moveTo(W / 2 + roadTopW / 4, horizon);
      ctx.lineTo(W / 2 + roadBotW / 4, H);
      ctx.stroke();

      if (racing) scrollRef.current = (scrollRef.current + 0.045 + cam * 0.015) % 1;
      const seg = 13;
      for (let i = 0; i < seg; i += 1) {
        const t0 = ((i + scrollRef.current) % seg) / seg;
        const t1 = t0 + 0.035;
        if (t1 > 1) continue;
        const y0 = horizon + (H - horizon) * t0 * t0;
        const y1 = horizon + (H - horizon) * t1 * t1;
        const w0 = 1 + 5 * t0 * t0;
        const w1 = 1 + 5 * t1 * t1;
        ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.7)' : 'rgba(251,191,36,0.55)';
        ctx.beginPath();
        ctx.moveTo(W / 2 - w0, y0);
        ctx.lineTo(W / 2 + w0, y0);
        ctx.lineTo(W / 2 + w1, y1);
        ctx.lineTo(W / 2 - w1, y1);
        ctx.closePath();
        ctx.fill();
      }

      if (racing) {
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1;
        for (let s = 0; s < 8; s += 1) {
          const sy = horizon + ((t * 2 + s * 40) % (H - horizon));
          ctx.beginPath();
          ctx.moveTo(W / 2 - roadBotW * 0.35, sy);
          ctx.lineTo(W / 2 - roadBotW * 0.35 - 30, sy - 8);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(W / 2 + roadBotW * 0.35, sy);
          ctx.lineTo(W / 2 + roadBotW * 0.35 + 30, sy - 8);
          ctx.stroke();
        }
      }

      const mapX = (progress, laneBias = 0) => {
        const pct = Math.max(0, Math.min(1, progress / trackLength));
        const marginL = W * 0.08;
        const marginR = W * 0.9;
        return marginL + (marginR - marginL) * pct + laneBias * 10;
      };

      const mapY = (lane, i, n) => {
        const laneTop = H * 0.38;
        const laneBottom = H - 26;
        const laneH = (laneBottom - laneTop) / Math.max(n, 1);
        return laneTop + laneH * i + laneH / 2 + (lane - 1) * 4;
      };

      const n = Math.max(list.length, 1);
      const hazardPulse = 0.5 + Math.sin(t * 0.06) * 0.5;

      hazardsRef.current.forEach((h) => {
        const hx = mapX(h.at);
        const hy = mapY(h.lane ?? 1, 0, n);
        const depth = 0.7 + 0.35 * (h.at / trackLength);
        drawHazard(ctx, hx, hy - 8, depth, hazardPulse);
      });

      coinsRef.current.forEach((c, ci) => {
        if (c.takenBy) return;
        const cx = mapX(c.at, (c.lane || 0) - 1);
        const cy = mapY(c.lane ?? 1, Math.min(list.length - 1, 0), n) - 14;
        const depth = 0.75 + 0.3 * (c.at / trackLength);
        drawCoin(ctx, cx, cy, c.value, depth, t * 0.05 + ci);
      });

      list.forEach((p, i) => {
        const s = samplesRef.current.get(p.socketId);
        let progress = Number(p.progress) || 0;
        if (s) {
          const span = Math.max(s.nextT - s.prevT, 1);
          const k = Math.min((now - s.nextT) / span + 1, 1.35);
          progress = s.prev + (s.next - s.prev) * Math.min(k, 1);
        }
        const depth = 0.78 + 0.35 * (i / n);
        const y = mapY(1, i, n);
        const x = mapX(progress);

        if (s?.boosting) {
          const trail = ctx.createLinearGradient(x - 80, y, x, y);
          trail.addColorStop(0, 'rgba(251,191,36,0)');
          trail.addColorStop(0.5, 'rgba(251,191,36,0.25)');
          trail.addColorStop(1, 'rgba(255,255,255,0.55)');
          ctx.strokeStyle = trail;
          ctx.lineWidth = 8 * depth;
          ctx.beginPath();
          ctx.moveTo(x - 80, y);
          ctx.lineTo(x, y);
          ctx.stroke();
        }

        drawSportsCar(
          ctx,
          x,
          y,
          p.car?.color || '#8b5cf6',
          p.car?.accent || '#e9d5ff',
          !!s?.boosting,
          !!s?.slowed,
          depth,
          t
        );

        ctx.font = `700 ${Math.round(10 * depth + 1)}px system-ui, sans-serif`;
        ctx.fillStyle = p.socketId === mySocketId ? '#fbbf24' : 'rgba(255,255,255,0.75)';
        ctx.textAlign = 'center';
        ctx.shadowColor = 'rgba(0,0,0,0.8)';
        ctx.shadowBlur = 4;
        ctx.fillText(p.socketId === mySocketId ? 'YOU' : (p.nickname || '').slice(0, 8), x, y - 24 * depth);
        ctx.shadowBlur = 0;

        if (p.collectedValue > 0) {
          ctx.fillStyle = '#fcd34d';
          ctx.font = `800 ${Math.round(9 * depth + 1)}px system-ui,sans-serif`;
          ctx.fillText(`+${p.collectedValue}`, x, y + 24 * depth);
        }

        if (p.finished && p.place) {
          ctx.font = `800 ${Math.round(12 * depth + 2)}px system-ui, sans-serif`;
          ctx.fillStyle = ['#fbbf24', '#cbd5e1', '#f97316'][p.place - 1] || 'rgba(255,255,255,0.5)';
          ctx.fillText(`#${p.place}`, x + 26 * depth, y + 4);
        }
      });

      const fx = W * 0.9;
      const sq = 8;
      for (let r = 0; r < Math.ceil((H - horizon) / sq); r += 1) {
        for (let c = 0; c < 2; c += 1) {
          ctx.fillStyle = (r + c) % 2 === 0 ? 'rgba(255,255,255,0.95)' : 'rgba(15,15,20,0.95)';
          ctx.fillRect(fx + c * sq, horizon + r * sq, sq, sq);
        }
      }
      ctx.shadowColor = 'rgba(251,191,36,0.5)';
      ctx.shadowBlur = 12;
      ctx.strokeStyle = 'rgba(251,191,36,0.4)';
      ctx.lineWidth = 2;
      ctx.strokeRect(fx - 2, horizon - 2, sq * 2 + 4, Math.min(H - horizon, sq * 12));
      ctx.shadowBlur = 0;

      const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.15, W / 2, H / 2, H * 0.95);
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
    <div className="mm-race-canvas-wrap">
      <canvas
        ref={canvasRef}
        className="mm-race-canvas w-full block"
        style={{ height }}
        aria-label="Highway heist race track"
      />
    </div>
  );
}
