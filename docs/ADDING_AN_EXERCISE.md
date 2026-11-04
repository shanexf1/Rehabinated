# Adding an exercise

An exercise is one data file. No engine code changes.

1. Copy `src/exercises/mini-squat.ts` to `src/exercises/<your-id>.ts`.
2. Edit the fields (below). Keep `id` kebab-case and unique.
3. Add it to the list in `src/exercises/index.ts`.
4. Run `npm test`. `defineExercise` validates the file when the app starts.

## Fields

| Field | What it means |
| --- | --- |
| `id`, `version` | Stable id (saved in progress and model inputs). Bump `version` when the target path or rep rule changes. |
| `name`, `summary`, `bodyArea`, `instructions`, `safety` | Text shown to the user. Short sentences. |
| `camera.view` | `side` or `front`: how the person faces the phone. `camera.tip` explains setup. |
| `primary.angle` | The angle that defines a rep. `{ kind: 'joint', a, b, c }` is the angle at `b` (e.g. hip-knee-ankle = knee bend). `{ kind: 'tilt', from, to }` is a segment's angle from vertical. |
| `primary.sides` | `auto` tracks the side the camera sees best. `both` tracks both and scores symmetry. |
| `rep.startDeg`, `rep.targetDeg` | Rest angle and target angle. Direction comes from which is bigger. |
| `rep.minRangeFraction` | A movement must reach this share of the planned range to count. |
| `rep.minDurationSec`, `rep.maxDurationSec` | Reps faster or slower than this are not counted. |
| `tempo` | Seconds to reach the target, hold, and return. This shapes the guide path and the tempo score. |
| `posture` | Optional extra angles with a `maxDeg` limit, e.g. trunk lean. |
| `weights` | Optional weights for the rule scorer parts: range, path, tempo, control, symmetry, posture. |
| `cues` | Optional coaching line per mistake. Missing ones use generic cues. |
| `plan` | Default sets, reps and rest. |

Joints you can use: `shoulder`, `elbow`, `wrist`, `hip`, `knee`, `ankle`,
`heel`, `foot`.

## Demo mode and tests

The demo simulator currently animates exercises whose primary angle is at the
knee (side view) or the shoulder (front view), and the tests run every
exercise through it. For a new joint (for example elbow curls), add a body
generator in `src/core/sim/simulator.ts`; otherwise the exercise still works
with the camera, but the demo button is hidden.

## Trained models

If a trained model is active, retrain it with some reps of the new exercise
and add the exercise id to the manifest. Until then the new exercise is scored
by the rules automatically. See `docs/MODEL.md`.
