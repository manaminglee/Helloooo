import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

const MAX_EDGE = 480;

let imageLandmarkerPromise = null;
let nativeDetector = null;

function getNativeDetector() {
  if (typeof FaceDetector === 'undefined') return null;
  if (!nativeDetector) {
    try {
      nativeDetector = new FaceDetector({ fastMode: true, maxDetectedFaces: 3 });
    } catch {
      nativeDetector = null;
    }
  }
  return nativeDetector;
}

async function loadImageLandmarker() {
  if (!imageLandmarkerPromise) {
    imageLandmarkerPromise = (async () => {
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm',
      );
      const opts = {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task',
        },
        runningMode: 'IMAGE',
        numFaces: 3,
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: false,
      };
      try {
        return await FaceLandmarker.createFromOptions(vision, {
          ...opts,
          baseOptions: { ...opts.baseOptions, delegate: 'GPU' },
        });
      } catch {
        return FaceLandmarker.createFromOptions(vision, {
          ...opts,
          baseOptions: { ...opts.baseOptions, delegate: 'CPU' },
        });
      }
    })();
  }
  return imageLandmarkerPromise;
}

/** Warm the face model while the camera starts — keeps validation under a few seconds. */
export function preloadFaceDetection() {
  void loadImageLandmarker();
  getNativeDetector();
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load image'));
    img.src = src;
  });
}

function downscaleCanvas(img) {
  const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(img, 0, 0, w, h);
  return canvas;
}

async function detectNative(source) {
  const detector = getNativeDetector();
  if (!detector) return null;
  try {
    const faces = await detector.detect(source);
    return faces.length > 0;
  } catch {
    return null;
  }
}

async function detectMediaPipe(canvas) {
  const landmarker = await loadImageLandmarker();
  const result = landmarker.detect(canvas);
  return (result?.faceLandmarks?.length ?? 0) > 0;
}

/**
 * Returns true when at least one face is found in the image (data URL or image src).
 * Uses the browser FaceDetector when available, otherwise MediaPipe (~1–3s cold, faster warm).
 */
export async function detectFaceInImage(src) {
  if (!src) return false;
  const img = await loadImage(src);
  const canvas = downscaleCanvas(img);

  const native = await detectNative(canvas);
  if (native === true) return true;
  if (native === false) return false;

  return detectMediaPipe(canvas);
}
