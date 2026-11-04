import { defineExercise } from '../core/exercise';

export default defineExercise({
  id: 'mini-squat',
  version: 1,
  name: 'Mini squat',
  summary: 'A small, supported knee bend to build leg strength.',
  bodyArea: 'Knees',
  camera: {
    view: 'side',
    tip: 'Stand side-on to the phone, about 2 to 3 metres away. Hold a counter or chair back for support.',
  },
  instructions: [
    'Stand tall, feet hip-width apart, holding on for support.',
    'Bend your knees a little, as if starting to sit.',
    'Keep your back tall and your heels down.',
    'Pause, then straighten up slowly.',
  ],
  safety: [
    'Only bend as far as is comfortable.',
    'Stop if your knee gives way or the pain is sharp.',
  ],
  primary: {
    label: 'Knee angle',
    angle: { kind: 'joint', a: 'hip', b: 'knee', c: 'ankle' },
    sides: 'auto',
  },
  rep: { startDeg: 175, targetDeg: 135, minRangeFraction: 0.4, minDurationSec: 1, maxDurationSec: 10 },
  tempo: { toTargetSec: 2, holdSec: 1, returnSec: 2 },
  posture: [{ label: 'Forward lean', angle: { kind: 'tilt', from: 'hip', to: 'shoulder' }, maxDeg: 35 }],
  cues: {
    too_shallow: 'Bend your knees a little more, as far as is comfortable.',
    posture: 'Keep your chest up and your back tall.',
  },
  plan: { sets: 2, reps: 10, restSec: 45 },
});
