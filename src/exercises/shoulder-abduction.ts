import { defineExercise } from '../core/exercise';

export default defineExercise({
  id: 'shoulder-abduction',
  version: 1,
  name: 'Side arm raise',
  summary: 'Raise both arms out to the side, up to shoulder height.',
  bodyArea: 'Shoulders',
  camera: {
    view: 'front',
    tip: 'Face the phone, about 2 metres away, so your arms and hips are in view.',
  },
  instructions: [
    'Stand or sit tall with your arms by your sides, thumbs forward.',
    'Raise both arms out to the side up to shoulder height.',
    'Pause for a moment.',
    'Lower them slowly back down.',
  ],
  safety: [
    'Raise only as high as is comfortable.',
    'Stop if you feel pinching or sharp pain in the shoulder.',
  ],
  primary: {
    label: 'Arm angle',
    angle: { kind: 'joint', a: 'hip', b: 'shoulder', c: 'elbow' },
    sides: 'both',
  },
  rep: { startDeg: 15, targetDeg: 90, minRangeFraction: 0.4, minDurationSec: 1, maxDurationSec: 10 },
  tempo: { toTargetSec: 2, holdSec: 1, returnSec: 2.5 },
  posture: [{ label: 'Side lean', angle: { kind: 'tilt', from: 'hip', to: 'shoulder' }, maxDeg: 15 }],
  cues: {
    too_shallow: 'Lift your arms a little higher, up toward shoulder height.',
    uneven: 'Try to lift both arms to the same height.',
    posture: 'Keep your body still and upright. Only your arms move.',
  },
  plan: { sets: 2, reps: 10, restSec: 45 },
});
