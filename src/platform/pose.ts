import type { PoseFrame } from '../core/types';

/**
 * Source of pose frames. Web: MediaPipe in the browser, or the built-in demo
 * simulator. Native: a camera frame processor that outputs the same 33-point
 * layout. The session code only sees PoseFrame.
 */
export interface PoseSource {
  start(onFrame: (frame: PoseFrame) => void): Promise<void>;
  stop(): void;
}
