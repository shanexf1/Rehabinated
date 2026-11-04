import { defineExercise } from '../core/exercise';

export default defineExercise({
  id: 'sit-to-stand',
  version: 1,
  name: 'Sit to stand',
  summary: 'Stand up from a chair and sit back down with control.',
  bodyArea: 'Knees and hips',
  camera: {
    view: 'side',
    tip: 'Put the phone about 2 to 3 metres away, side-on to your chair, so your whole body is in view.',
  },
  instructions: [
    'Sit near the front of a sturdy chair with your feet flat.',
    'Lean forward a little and stand up tall.',
    'Pause for a moment at the top.',
    'Sit back down slowly, reaching back for the chair.',
  ],
  safety: [
    'Stop if you feel sharp or sudden pain.',
    'Stop and call your clinician if you feel dizzy or unsteady.',
  ],
  primary: {
    label: 'Knee angle',
    angle: { kind: 'joint', a: 'hip', b: 'knee', c: 'ankle' },
    sides: 'auto',
  },
  rep: { startDeg: 90, targetDeg: 165, minRangeFraction: 0.45, minDurationSec: 1.2, maxDurationSec: 12 },
  tempo: { toTargetSec: 2, holdSec: 1, returnSec: 2.5 },
  posture: [{ label: 'Forward lean', angle: { kind: 'tilt', from: 'hip', to: 'shoulder' }, maxDeg: 55 }],
  cues: {
    too_shallow: 'Try to stand up all the way, with your hips forward.',
    dropped: 'Sit down slowly. Reach back for the chair and lower yourself gently.',
    posture: 'Lean forward a little less. Push up through your heels.',
    too_fast: 'Take your time standing up. Count to two on the way up.',
  },
  plan: { sets: 2, reps: 8, restSec: 60 },
});
