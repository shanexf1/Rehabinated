import { forwardRef, useImperativeHandle, useRef } from 'react';
import type { ExerciseDefinition } from '../../core/exercise';
import { jointIndex, SKELETON_EDGES } from '../../core/landmarks';
import type { Joint, PoseFrame, Side } from '../../core/types';

export interface PoseCanvasHandle {
  draw(frame: PoseFrame, opts: { side?: Side; videoSize?: [number, number]; quality?: 'ok' | 'off' }): void;
}

function primaryJoints(ex: ExerciseDefinition): Joint[] {
  const a = ex.primary.angle;
  return a.kind === 'joint' ? [a.a, a.b, a.c] : [a.from, a.to];
}

/** Draws the tracked skeleton over the camera image (or alone in demo mode). */
export const PoseCanvas = forwardRef<PoseCanvasHandle, { ex: ExerciseDefinition; demo: boolean }>(function PoseCanvas({ ex, demo }, ref) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useImperativeHandle(ref, () => ({
    draw(frame, { side, videoSize, quality }) {
      const c = canvas.current;
      if (!c) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const cw = c.clientWidth;
      const ch = c.clientHeight;
      if (c.width !== Math.round(cw * dpr) || c.height !== Math.round(ch * dpr)) {
        c.width = Math.round(cw * dpr);
        c.height = Math.round(ch * dpr);
      }
      const g = c.getContext('2d')!;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, cw, ch);

      // Map normalized coords to the canvas the same way object-fit: cover maps the video.
      // Demo mode has no video: fit the figure inside with room for the HUD.
      const [vw, vh] = videoSize ?? [ch * 0.75, ch];
      const scale = videoSize ? Math.max(cw / vw, ch / vh) : Math.min(cw / vw, (ch - 200) / vh) * 0.95;
      const dw = vw * scale;
      const dh = vh * scale;
      const ox = (cw - dw) / 2;
      const oy = videoSize ? (ch - dh) / 2 : 185;
      const P = (i: number): [number, number] => [ox + frame.landmarks[i].x * dw, oy + frame.landmarks[i].y * dh];

      if (demo) {
        g.fillStyle = '#0d1b1e';
        g.fillRect(0, 0, cw, ch);
        g.strokeStyle = 'rgba(255,255,255,0.08)';
        g.beginPath();
        const floor = oy + 0.95 * dh;
        g.moveTo(0, floor);
        g.lineTo(cw, floor);
        g.stroke();
      }

      const sides: Side[] = ex.primary.sides === 'both' ? ['left', 'right'] : [side ?? 'left'];
      const hi = new Set(sides.flatMap((s) => primaryJoints(ex).map((j) => jointIndex(j, s))));
      const color = quality === 'off' ? '#fbbf24' : '#7fd6cb';

      g.lineCap = 'round';
      for (const [a, b] of SKELETON_EDGES) {
        if (frame.landmarks[a].visibility < 0.3 || frame.landmarks[b].visibility < 0.3) continue;
        const strong = hi.has(a) && hi.has(b);
        g.strokeStyle = strong ? '#fb923c' : color;
        g.lineWidth = strong ? 8 : demo ? 7 : 4;
        g.globalAlpha = strong ? 1 : 0.85;
        const [x1, y1] = P(a);
        const [x2, y2] = P(b);
        g.beginPath();
        g.moveTo(x1, y1);
        g.lineTo(x2, y2);
        g.stroke();
      }
      g.globalAlpha = 1;
      if (demo) {
        const [hx, hy] = P(0);
        g.fillStyle = color;
        g.beginPath();
        g.arc(hx, hy, 16, 0, Math.PI * 2);
        g.fill();
      }
      for (const i of hi) {
        const [px, py] = P(i);
        g.fillStyle = '#ffffff';
        g.beginPath();
        g.arc(px, py, 7, 0, Math.PI * 2);
        g.fill();
      }
    },
  }));

  return <canvas ref={canvas} />;
});
