import React, { useEffect, useRef } from 'react';

/**
 * Highway heist canvas — asphalt road, painted sports cars, roadside coins & hazards.
 * Server sends progress ~10x/sec; we interpolate at 60fps.
 */

function drawSportsCar(ctx, x, y, color, accent, boosting, slowed, scale = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.rotate(-0.08);

  if (boosting) {
    const flame = ctx.createLinearGradient(-28, 0, -8, 0);
    flame.addColorStop(0, 'rgba(251,191,36,0)');
    flame.addColorStop(0.4, 'rgba(249,115,22,0.75)');
    flame.addColorStop(1, 'rgba(254,240,138,0.95)');
    ctx.fillStyle = flame;
    ctx.beginPath();
    ctx.moveTo(-10, -4);
    ctx.lineTo(-10, 4);
    ctx.lineTo(-32 - Math.random() * 8, 1);
    ctx.lineTo(-28 - Math.random() * 6, -2);
    ctx.closePath();
    ctx.fill();
  }

  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.ellipse(2, 10, 16, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Lower body
  ctx.fillStyle = color;
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

  // Cabin / windshield
  ctx.fillStyle = accent || 'rgba(255,255,255,0.55)';
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.moveTo(-4, -5);
  ctx.lineTo(8, -5.5);
  ctx.lineTo(10, -1);
  ctx.lineTo(-6, -0.5);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;

  // Hood stripe
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(4, -2, 10, 3);

  // Wheels
  ctx.fillStyle = '#0a0a0c';
  [[-10, 7], [10, 7]].forEach(([wx, wy]) => {
    ctx.beginPath();
    ctx.ellipse(wx, wy, 4.2, 4.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = accent || '#94a3b8';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(wx, wy, 2, 2.2, 0, 0, Math.PI * 2);
    ctx.stroke();
  });

  // Headlights
  ctx.fillStyle = '#fef9c3';
  ctx.beginPath();
  ctx.ellipse(17, 1, 2.2, 1.4, 0, 0, Math.PI * 2);
  ctx.fill();

  if (slowed) {
    ctx.strokeStyle = 'rgba(248,113,113,0.9)';
    ctx.lineWidth = 2;
    ctx.strokeRect(-18, -10, 36, 20);
  } else if (boosting) {
    ctx.strokeStyle = 'rgba(251,191,36,0.85)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  ctx.restore();
}

function drawCoin(ctx, x, y, value, scale) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  const g = ctx.createRadialGradient(0, 0, 1, 0, 0, 9);
  g.addColorStop(0, '#fef08a');
  g.addColorStop(0.55, '#fbbf24');
  g.addColorStop(1, '#b45309');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(120,53,15,0.7)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = '#78350f';
  ctx.font = 'bold 8px system-ui,sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(value), 0, 0.5);
  ctx.restore();
}

function drawHazard(ctx, x, y, scale) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = '#f97316';
  ctx.beginPath();
  ctx.moveTo(0, -9);
  ctx.lineTo(9, 8);
  ctx.lineTo(-9, 8);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#111';
  ctx.font = 'bold 10px system-ui,sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('!', 0, 5);
  ctx.restore();
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

      // Sky
      const sky = ctx.createLinearGradient(0, 0, 0, H * 0.42);
      sky.addColorStop(0, '#0c1220');
      sky.addColorStop(0.5, '#1a1040');
      sky.addColorStop(1, '#2a1848');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H * 0.42);

      // Stars
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      for (let i = 0; i < 28; i += 1) {
        const sx = ((i * 97 + cam * 40) % W);
        const sy = 8 + (i * 37) % (H * 0.2);
        ctx.fillRect(sx, sy, 1.5, 1.5);
      }

      const horizon = H * 0.32;

      // Mountains
      ctx.fillStyle = '#1e1633';
      ctx.beginPath();
      ctx.moveTo(0, horizon);
      for (let i = 0; i <= 8; i += 1) {
        ctx.lineTo((W * i) / 8, horizon - 18 - ((i * 41) % 36));
      }
      ctx.lineTo(W, horizon);
      ctx.closePath();
      ctx.fill();

      // Road asphalt
      const roadTopW = W * 0.18;
      const roadBotW = W * 1.05;
      const asphalt = ctx.createLinearGradient(0, horizon, 0, H);
      asphalt.addColorStop(0, '#3f4454');
      asphalt.addColorStop(1, '#1c1f28');
      ctx.fillStyle = asphalt;
      ctx.beginPath();
      ctx.moveTo(W / 2 - roadTopW / 2, horizon);
      ctx.lineTo(W / 2 + roadTopW / 2, horizon);
      ctx.lineTo(W / 2 + roadBotW / 2, H + 4);
      ctx.lineTo(W / 2 - roadBotW / 2, H + 4);
      ctx.closePath();
      ctx.fill();

      // Shoulder
      ctx.strokeStyle = 'rgba(248,250,252,0.55)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(W / 2 - roadTopW / 2, horizon);
      ctx.lineTo(W / 2 - roadBotW / 2, H);
      ctx.moveTo(W / 2 + roadTopW / 2, horizon);
      ctx.lineTo(W / 2 + roadBotW / 2, H);
      ctx.stroke();

      if (racing) scrollRef.current = (scrollRef.current + 0.035 + cam * 0.01) % 1;
      const seg = 11;
      for (let i = 0; i < seg; i += 1) {
        const t0 = ((i + scrollRef.current) % seg) / seg;
        const t1 = t0 + 0.04;
        if (t1 > 1) continue;
        const y0 = horizon + (H - horizon) * t0 * t0;
        const y1 = horizon + (H - horizon) * t1 * t1;
        const w0 = 1 + 5 * t0 * t0;
        const w1 = 1 + 5 * t1 * t1;
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.beginPath();
        ctx.moveTo(W / 2 - w0, y0);
        ctx.lineTo(W / 2 + w0, y0);
        ctx.lineTo(W / 2 + w1, y1);
        ctx.lineTo(W / 2 - w1, y1);
        ctx.closePath();
        ctx.fill();
      }

      const mapX = (progress, laneBias = 0) => {
        const pct = Math.max(0, Math.min(1, progress / trackLength));
        const marginL = W * 0.1;
        const marginR = W * 0.88;
        return marginL + (marginR - marginL) * pct + laneBias * 10;
      };

      const mapY = (lane, i, n) => {
        const laneTop = H * 0.4;
        const laneBottom = H - 28;
        const laneH = (laneBottom - laneTop) / Math.max(n, 1);
        return laneTop + laneH * i + laneH / 2 + (lane - 1) * 4;
      };

      // Hazards & coins in world space relative to track progress
      const n = Math.max(list.length, 1);
      hazardsRef.current.forEach((h) => {
        const hx = mapX(h.at);
        const hy = mapY(h.lane ?? 1, 0, n);
        const depth = 0.7 + 0.35 * (h.at / trackLength);
        drawHazard(ctx, hx, hy - 8, depth);
      });

      coinsRef.current.forEach((c) => {
        if (c.takenBy) return;
        const cx = mapX(c.at, (c.lane || 0) - 1);
        const cy = mapY(c.lane ?? 1, Math.min(list.length - 1, 0), n) - 14;
        const depth = 0.75 + 0.3 * (c.at / trackLength);
        drawCoin(ctx, cx, cy, c.value, depth);
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
          const trail = ctx.createLinearGradient(x - 70, y, x, y);
          trail.addColorStop(0, 'rgba(251,191,36,0)');
          trail.addColorStop(1, 'rgba(251,191,36,0.45)');
          ctx.strokeStyle = trail;
          ctx.lineWidth = 6 * depth;
          ctx.beginPath();
          ctx.moveTo(x - 70, y);
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
          depth
        );

        ctx.font = `700 ${Math.round(10 * depth + 1)}px system-ui, sans-serif`;
        ctx.fillStyle = p.socketId === mySocketId ? '#fbbf24' : 'rgba(255,255,255,0.7)';
        ctx.textAlign = 'center';
        ctx.fillText(p.socketId === mySocketId ? 'YOU' : (p.nickname || '').slice(0, 8), x, y - 22 * depth);

        if (p.collectedValue > 0) {
          ctx.fillStyle = '#fcd34d';
          ctx.font = `800 ${Math.round(9 * depth + 1)}px system-ui,sans-serif`;
          ctx.fillText(`+${p.collectedValue}`, x, y + 22 * depth);
        }

        if (p.finished && p.place) {
          ctx.font = `800 ${Math.round(12 * depth + 2)}px system-ui, sans-serif`;
          ctx.fillStyle = ['#fbbf24', '#cbd5e1', '#f97316'][p.place - 1] || 'rgba(255,255,255,0.5)';
          ctx.fillText(`#${p.place}`, x + 24 * depth, y + 4);
        }
      });

      // Finish checker
      const fx = W * 0.88;
      const sq = 7;
      for (let r = 0; r < Math.ceil((H - horizon) / sq); r += 1) {
        for (let c = 0; c < 2; c += 1) {
          ctx.fillStyle = (r + c) % 2 === 0 ? 'rgba(255,255,255,0.9)' : 'rgba(15,15,20,0.9)';
          ctx.fillRect(fx + c * sq, horizon + r * sq, sq, sq);
        }
      }

      const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, H * 0.9);
      vig.addColorStop(0, 'rgba(0,0,0,0)');
      vig.addColorStop(1, 'rgba(0,0,0,0.45)');
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
      aria-label="Highway heist race track"
    />
  );
}
