# Architecture

The app is split so that everything that decides *what happened in a set*
lives in plain TypeScript with no browser or React APIs. Only the screens and
a few small adapters are web-specific.

```
camera ──> PoseSource ──> SetSession (core) ──> RepScorer ──> SetResult ──> progress (core)
           (platform)      angles, reps,         rules or        tips          XP, streaks
                           features              trained model
```

| Layer | Folder | Web today | Native later |
| --- | --- | --- | --- |
| Pose | `platform/pose.ts` | `web/adapters/mediapipePose.ts` (MediaPipe Tasks, on device) | Camera frame processor emitting the same 33-point `PoseFrame` (for example react-native-vision-camera with a MediaPipe or ML Kit pose plugin) |
| Model runtime | `platform/inference.ts` | `web/adapters/onnxRuntime.ts` (onnxruntime-web) | onnxruntime-react-native, same `.onnx` files and manifest |
| Storage | `platform/storage.ts` | `localStorage` | AsyncStorage |
| Speech | `platform/speech.ts` | `speechSynthesis` | expo-speech |
| UI | `web/` | React DOM | React Native screens (rewrite), same state shape |
| Logic | `core/`, `exercises/` | shared | shared, unchanged |

`npm run typecheck` checks `src/core`, `src/exercises` and `src/platform` a
second time with no DOM types (`tsconfig.core.json`), so browser APIs cannot
creep into the shared code.

## Moving to a native app

1. Create an Expo app (dev build, since pose tracking needs a native module).
2. Copy or symlink `src/core`, `src/exercises` and `src/platform` (or publish
   them as a small package in a monorepo).
3. Implement the four platform interfaces above.
4. Rebuild the screens in React Native. `web/state.ts` and the screen props
   show what each screen needs; the core calls stay the same.
5. Reuse `public/models/` as app assets for the trained model.

## Key design choices

- **Angles, not pixels.** Features use joint angles from world landmarks, so
  they do not depend on body size, distance or camera, and data from other
  sources (for example KIMORE or UI-PRMD skeletons) can be mapped in.
- **Baseline-relative reps.** A rep is measured from the person's own resting
  angle, with hysteresis thresholds, so small wobbles are ignored and people
  who cannot reach the textbook start angle still count.
- **Scorer interface.** Rules and trained models both implement `RepScorer`,
  and `ScorerChain` falls back to rules if a model is missing, does not cover
  an exercise, or throws.
