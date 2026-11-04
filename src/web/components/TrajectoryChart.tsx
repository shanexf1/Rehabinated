import { useMemo } from 'react';
import { plannedDuration, type ExerciseDefinition } from '../../core/exercise';
import { targetProgressAt } from '../../core/trajectory';

/**
 * The joint trajectory trainer: the guide path for one rep (dashed), the
 * person's live path on top, and a moving dot showing where they should be.
 */
export function TrajectoryChart({ ex, live, guideT, ghost }: {
  ex: ExerciseDefinition;
  /** [seconds since rep start, progress] */
  live: Array<[number, number]>;
  /** Seconds since rep start, or undefined while resting. */
  guideT?: number;
  /** Last finished rep, drawn faintly while resting. */
  ghost?: Array<[number, number]>;
}) {
  const W = 340;
  const H = 150;
  const padL = 44;
  const padR = 10;
  const padT = 12;
  const padB = 22;
  const total = plannedDuration(ex) * 1.35;
  const x = (t: number) => padL + (Math.min(t, total) / total) * (W - padL - padR);
  const y = (p: number) => padT + (1 - Math.max(-0.1, Math.min(1.2, p)) / 1.2) * (H - padT - padB);

  const guidePath = useMemo(() => {
    const pts: string[] = [];
    for (let i = 0; i <= 80; i++) {
      const t = (i / 80) * plannedDuration(ex);
      pts.push(`${x(t).toFixed(1)},${y(targetProgressAt(ex, t)).toFixed(1)}`);
    }
    return pts.join(' ');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ex]);

  const line = (pts: Array<[number, number]>) => pts.map(([t, p]) => `${x(t).toFixed(1)},${y(p).toFixed(1)}`).join(' ');
  const last = live[live.length - 1];

  return (
    <svg className="traj" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Guide path and your movement for this rep">
      <line x1={padL} x2={W - padR} y1={y(1)} y2={y(1)} stroke="#ffffff" strokeOpacity={0.18} strokeDasharray="2 4" />
      <line x1={padL} x2={W - padR} y1={y(0)} y2={y(0)} stroke="#ffffff" strokeOpacity={0.18} />
      <text x={padL - 6} y={y(1) + 4} textAnchor="end" fontSize="11" fill="#cfe3e3">{ex.rep.targetDeg}°</text>
      <text x={padL - 6} y={y(0) + 4} textAnchor="end" fontSize="11" fill="#cfe3e3">{ex.rep.startDeg}°</text>
      <text x={padL} y={H - 6} fontSize="11" fill="#cfe3e3">0 s</text>
      <text x={x(plannedDuration(ex))} y={H - 6} textAnchor="middle" fontSize="11" fill="#cfe3e3">{plannedDuration(ex)} s</text>
      <polyline points={guidePath} fill="none" stroke="#7fd6cb" strokeWidth={3} strokeDasharray="7 6" strokeLinecap="round" />
      {ghost && ghost.length > 1 && live.length === 0 && (
        <polyline points={line(ghost)} fill="none" stroke="#fb923c" strokeOpacity={0.35} strokeWidth={3} strokeLinejoin="round" />
      )}
      {live.length > 1 && <polyline points={line(live)} fill="none" stroke="#fb923c" strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" />}
      {guideT !== undefined && guideT <= plannedDuration(ex) && (
        <circle cx={x(guideT)} cy={y(targetProgressAt(ex, guideT))} r={7} fill="#7fd6cb" stroke="#071012" strokeWidth={2} />
      )}
      {last && <circle cx={x(last[0])} cy={y(last[1])} r={6} fill="#fb923c" stroke="#071012" strokeWidth={2} />}
    </svg>
  );
}
