import type { PoseFrame } from '../../core/types';
import type { PoseSource } from '../../platform/pose';

// Served from public/vendor (see scripts/vendor-assets.mjs).
const WASM_URL = new URL('vendor/mediapipe', document.baseURI).href;
const LOCAL_MODEL = new URL('vendor/mediapipe/pose_landmarker_lite.task', document.baseURI).href;
const CDN_MODEL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

async function modelUrl(): Promise<string> {
  try {
    const r = await fetch(LOCAL_MODEL, { method: 'HEAD' });
    if (r.ok) return LOCAL_MODEL;
  } catch {
    /* fall through */
  }
  return CDN_MODEL;
}

/**
 * Live pose from the phone camera using MediaPipe Pose Landmarker, entirely
 * on the device. Video frames never leave the phone.
 */
export class MediaPipePoseSource implements PoseSource {
  private stream?: MediaStream;
  private running = false;
  private stopped = false;
  private landmarker?: { detectForVideo: (v: HTMLVideoElement, t: number) => any; close: () => void };

  constructor(private readonly video: HTMLVideoElement) {}

  async start(onFrame: (frame: PoseFrame) => void): Promise<void> {
    const [{ FilesetResolver, PoseLandmarker }, stream] = await Promise.all([
      import('@mediapipe/tasks-vision'),
      navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      }),
    ]);
    this.stream = stream;
    if (this.stopped) return this.stop();
    this.video.srcObject = stream;
    this.video.muted = true;
    this.video.playsInline = true;
    await this.video.play();

    const [vision, model] = await Promise.all([FilesetResolver.forVisionTasks(WASM_URL), modelUrl()]);
    const make = (delegate: 'GPU' | 'CPU') =>
      PoseLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: model, delegate },
        runningMode: 'VIDEO',
        numPoses: 1,
      });
    try {
      this.landmarker = await make('GPU');
    } catch {
      this.landmarker = await make('CPU');
    }

    if (this.stopped) return this.stop();
    this.running = true;
    let lastVideoTime = -1;
    const loop = () => {
      if (!this.running || !this.landmarker) return;
      if (this.video.readyState >= 2 && this.video.currentTime !== lastVideoTime) {
        lastVideoTime = this.video.currentTime;
        const now = performance.now();
        const res = this.landmarker.detectForVideo(this.video, now);
        const lm = res.landmarks?.[0];
        if (lm) {
          onFrame({
            timestamp: now,
            landmarks: lm.map((p: any) => ({ x: p.x, y: p.y, z: p.z, visibility: p.visibility ?? 1 })),
            world: res.worldLandmarks?.[0]?.map((p: any, i: number) => ({
              x: p.x,
              y: p.y,
              z: p.z,
              visibility: lm[i]?.visibility ?? 1,
            })),
          });
        }
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  stop(): void {
    this.stopped = true;
    this.running = false;
    this.landmarker?.close();
    this.landmarker = undefined;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = undefined;
  }
}
