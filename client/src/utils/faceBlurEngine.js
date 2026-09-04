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

function clipFaceMesh(ctx, landmarks, w, h, mirror, expand = 1.1) {
  const points = FACE_OVAL.map((idx) => mapPoint(landmarks[idx], w, h, mirror));
  let cx = 0;
  let cy = 0;
  points.forEach((p) => { cx += p.x; cy += p.y; });
  cx /= points.length;
  cy /= points.length;

  ctx.beginPath();
  points.forEach((p, i) => {
    const x = cx + (p.x - cx) * expand;
    const y = cy + (p.y - cy) * expand;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
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
  if (mirror) {
    blurCtx.translate(w, 0);
    blurCtx.scale(-1, 1);
  }
  blurCtx.drawImage(video, 0, 0, w, h);
  blurCtx.restore();
  blurCtx.filter = 'none';

  for (const landmarks of faces) {
    ctx.save();
    clipFaceMesh(ctx, landmarks, w, h, mirror);
    ctx.clip();
    ctx.drawImage(blurCtx.canvas, 0, 0, w, h);
    ctx.restore();
  }

  return true;
}

/**
 * Soft beauty pass: gentle skin smooth + slight brighten/warm on the face oval.
 */
export function drawBeautyFrame(ctx, blurCtx, video, landmarker, mirror, timestampMs) {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return false;

  ensureCanvasSize(ctx, blurCtx, w, h);
  drawBaseFrame(ctx, video, w, h, mirror);

  const results = landmarker.detectForVideo(video, timestampMs);
  const faces = results?.faceLandmarks;
  if (!faces?.length) {
    ctx.save();
    ctx.filter = 'brightness(1.04) contrast(1.03) saturate(1.06)';
    ctx.drawImage(ctx.canvas, 0, 0);
    ctx.filter = 'none';
    ctx.restore();
    return true;
  }

  blurCtx.save();
  blurCtx.filter = 'blur(6px) brightness(1.08) contrast(1.02) saturate(1.08)';
  if (mirror) {
    blurCtx.translate(w, 0);
    blurCtx.scale(-1, 1);
  }
  blurCtx.drawImage(video, 0, 0, w, h);
  blurCtx.restore();
  blurCtx.filter = 'none';

  for (const landmarks of faces) {
    ctx.save();
    clipFaceMesh(ctx, landmarks, w, h, mirror, 1.14);
    ctx.clip();
    ctx.globalAlpha = 0.55;
    ctx.drawImage(blurCtx.canvas, 0, 0, w, h);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = 'rgba(255, 236, 220, 0.28)';
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
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
