// Copies the pose-tracking and model-runtime files into public/vendor so the
// app serves them itself (no third-party CDN at runtime, works offline once
// cached). Runs automatically before `npm run dev` and `npm run build`.
import { copyFileSync, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public', 'vendor');

const copies = [
  ['node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_internal.js', 'mediapipe/vision_wasm_internal.js'],
  ['node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_internal.wasm', 'mediapipe/vision_wasm_internal.wasm'],
  ['node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_nosimd_internal.js', 'mediapipe/vision_wasm_nosimd_internal.js'],
  ['node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_nosimd_internal.wasm', 'mediapipe/vision_wasm_nosimd_internal.wasm'],
  ['node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs', 'ort/ort-wasm-simd-threaded.mjs'],
  ['node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm', 'ort/ort-wasm-simd-threaded.wasm'],
];

for (const [from, to] of copies) {
  const dest = join(out, to);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(join(root, from), dest);
}

// The pose model (about 5.6 MB, Apache-2.0) is downloaded once and cached.
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const modelPath = join(out, 'mediapipe', 'pose_landmarker_lite.task');
if (!existsSync(modelPath) || statSync(modelPath).size < 1_000_000) {
  try {
    const res = await fetch(MODEL_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    writeFileSync(modelPath, Buffer.from(await res.arrayBuffer()));
    console.log('[vendor] downloaded pose model');
  } catch (err) {
    console.warn(`[vendor] could not download the pose model (${err.message}). The app will load it from Google's CDN instead.`);
  }
}
console.log('[vendor] assets ready in public/vendor');
