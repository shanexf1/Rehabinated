# Rehabinated

A phone-first home rehab coach. Prop your phone up, do your exercise, and the
app tracks your joints with the camera, counts reps, compares each rep with a
target movement path, scores the set and gives plain-language tips. Daily XP,
a streak and streak freezes keep people coming back.

It runs in the phone's browser (no install) and is built so the logic can move
into a native app later. Video is processed on the phone and never uploaded.

## Features

- **Joint trajectory training:** each exercise has a target angle path for one
  rep. The live chart shows the guide path, your path and a pace dot.
- **Automatic rep counting** from the joint angle (no tapping).
- **Set scoring and tips:** every rep gets a 0 to 100 score and a main mistake
  (too small, too fast, dropped, wobbly, uneven, posture). The set summary
  turns those into one to three tips. Spoken cues during the set.
- **Drop-in trained model:** put an ONNX model plus `manifest.json` in
  `public/models/` and the app uses it instead of the built-in rules.
- **Daily habit:** XP, a daily goal, streaks, streak freezes and a rest-day
  option for pain days, plus milestones.
- **Demo mode:** a simulated person performs a set with typical mistakes, so
  the app can be shown without a camera.
- **Data collection mode:** saves each rep's measurements (not video) and
  exports a CSV for building a training set.

## Run it

```bash
npm install
npm run dev        # opens on your network; use the https deploy for phone cameras
npm test           # core logic tests
npm run build      # production build in dist/
```

Phone browsers only allow the camera on `https://` pages (or `localhost`). The
easiest way to use it on a phone is the GitHub Pages deploy below.

### Deploy to GitHub Pages

1. In the repo on GitHub: **Settings > Pages > Build and deployment > Source:
   GitHub Actions**.
2. Push to `main`. The `Deploy` workflow builds and publishes the site at
   `https://<user>.github.io/<repo>/`.
3. Open that link on a phone and use **Add to Home Screen** to get an app icon.

## Project layout

```
src/
  core/        Portable logic, no browser APIs (type-checked without DOM)
    geometry.ts      joint angles from pose landmarks
    trajectory.ts    target path, resampling, DTW path error
    repDetector.ts   rep counting state machine
    features.ts      per-rep features (model inputs)
    scoring/         RuleScorer, ModelScorer, manifest format
    session.ts       SetSession: frames in, reps + scores + tips out
    progress.ts      XP, streaks, freezes, milestones
    sim/             demo simulator (also used by tests)
  exercises/   One data file per exercise + index.ts registry
  platform/    Interfaces the core needs: pose source, storage, speech, inference
  web/         React UI and web implementations of the platform interfaces
training/      Python template that trains and exports drop-in models
docs/          Architecture, adding an exercise, model format
tests/         Vitest tests for the core
```

## Docs

- [Architecture and moving to native](docs/ARCHITECTURE.md)
- [Adding an exercise](docs/ADDING_AN_EXERCISE.md)
- [Trained models: data, training and drop-in format](docs/MODEL.md)

Rehabinated is a practice aid, not a medical device.
