import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

/** MediaPipe face-oval contour indices — tracks jaw, cheeks, and forehead. */
const FACE_OVAL = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288,
  397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
  172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
];

let landmarkerPromise = null;

async function createLandmarker(delegate) {
  const vision = await FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm',
  );
  return FaceLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task',
      delegate,
    },
    runningMode: 'VIDEO',
    numFaces: 3,
    outputFaceBlendshapes: false,
    outputFacialTransformationMatrixes: false,
  });
}

export async function loadFaceLandmarker() {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      try {
        return await createLandmarker('GPU');
      } catch {
        return createLandmarker('CPU');
      }
    })();
  }
  return landmarkerPromise;
}

function mapPoint(landmark, w, h, mirror) {
  let x = landmark.x * w;
  const y = landmark.y * h;
  if (mirror) x = w - x;
  return { x, y };
}

function faceOvalBounds(landmarks, w, h, mirror, expand = 1.12) {
  const points = FACE_OVAL.map((idx) => mapPoint(landmarks[idx], w, h, mirror));
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  points.forEach((p) => {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  });
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return {
    cx,
    cy,
    rx: Math.max(12, ((maxX - minX) / 2) * expand),
    ry: Math.max(16, ((maxY - minY) / 2) * expand),
  };
}

/** Elliptical face mask — smooth edge, no polygon “mesh” seam. */
function clipFeatheredFace(ctx, landmarks, w, h, mirror, expand = 1.12) {
  const { cx, cy, rx, ry } = faceOvalBounds(landmarks, w, h, mirror, expand);
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.closePath();
}

function ensureCanvasSize(ctx, blurCtx, w, h) {
  if (ctx.canvas.width !== w) ctx.canvas.width = w;
  if (ctx.canvas.height !== h) ctx.canvas.height = h;
  if (blurCtx.canvas.width !== w) blurCtx.canvas.width = w;
  if (blurCtx.canvas.height !== h) blurCtx.canvas.height = h;
}

function drawBaseFrame(ctx, video, w, h, mirror) {
  ctx.save();
  if (mirror) {
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, 0, 0, w, h);
  ctx.restore();
}

function drawMirroredImage(ctx, source, w, h, mirror) {
  ctx.save();
  if (mirror) {
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(source, 0, 0, w, h);
  ctx.restore();
}

/**
 * Draw one video frame with tracked face-region blur onto `ctx`.
 */
export function drawFaceBlurFrame(ctx, blurCtx, video, landmarker, mirror, timestampMs) {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return false;

  ensureCanvasSize(ctx, blurCtx, w, h);
  drawBaseFrame(ctx, video, w, h, mirror);

  const results = landmarker.detectForVideo(video, timestampMs);
  const faces = results?.faceLandmarks;
  if (!faces?.length) return true;

  blurCtx.save();
  blurCtx.filter = 'blur(20px)';
  drawMirroredImage(blurCtx, video, w, h, mirror);
  blurCtx.restore();
  blurCtx.filter = 'none';

  for (const landmarks of faces) {
    ctx.save();
    clipFeatheredFace(ctx, landmarks, w, h, mirror);
    ctx.clip();
    ctx.drawImage(blurCtx.canvas, 0, 0, w, h);
    ctx.restore();
  }

  return true;
}

/**
 * Soft beauty pass — full-frame tone + light smooth when a face is present.
 * No per-face polygon clip, so nothing “mesh-like” appears on stream.
 */
export function drawBeautyFrame(ctx, blurCtx, video, landmarker, mirror, timestampMs) {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return false;

  ensureCanvasSize(ctx, blurCtx, w, h);

  const results = landmarker.detectForVideo(video, timestampMs);
  const hasFace = (results?.faceLandmarks?.length ?? 0) > 0;

  ctx.save();
  if (mirror) {
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
  }
  ctx.filter = hasFace
    ? 'brightness(1.06) contrast(1.04) saturate(1.08)'
    : 'brightness(1.03) contrast(1.02) saturate(1.04)';
  ctx.drawImage(video, 0, 0, w, h);
  ctx.filter = 'none';
  ctx.restore();

  if (hasFace) {
    blurCtx.save();
    blurCtx.filter = 'blur(4px)';
    drawMirroredImage(blurCtx, video, w, h, mirror);
    blurCtx.restore();
    blurCtx.filter = 'none';

    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.drawImage(blurCtx.canvas, 0, 0, w, h);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  return true;
}

/** Unified face processing: mode = 'beauty' | 'blur' | 'off' */
export function drawFaceProcessedFrame(ctx, blurCtx, video, landmarker, mirror, timestampMs, mode = 'blur') {
  if (mode === 'off') {
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return false;
    ensureCanvasSize(ctx, blurCtx, w, h);
    drawBaseFrame(ctx, video, w, h, mirror);
    return true;
  }
  if (mode === 'beauty') {
    return drawBeautyFrame(ctx, blurCtx, video, landmarker, mirror, timestampMs);
  }
  return drawFaceBlurFrame(ctx, blurCtx, video, landmarker, mirror, timestampMs);
}
