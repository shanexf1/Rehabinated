# Trained models

The app scores reps with built-in rules until you drop trained weights into
`public/models/`. No code changes are needed.

## How it fits

For every rep the core computes the features in `src/core/features.ts`
(`FEATURE_NAMES`). Two optional models read those features:

- **Score model** (regression) outputs a 0 to 100 quality score.
- **Mistake model** (classification) outputs the main mistake, which picks the tip.

You can supply either one or both. Whatever is missing comes from the rules,
and exercises the model does not list are scored by the rules.

## 1. Collect data

1. In the app, turn on **Settings > Data collection mode**.
2. Record sets with the camera: good reps and deliberate mistakes, several
   people, different rooms and light.
3. **Export CSV.** Each row is one rep: ids, the features, the app's own score,
   empty `label_score` and `label_mistake` columns, and the 50-point rep curve.
4. Raters fill in `label_score` (0 to 100) and/or `label_mistake` (one of
   `good, too_shallow, too_fast, too_slow, dropped, jerky, off_path, uneven,
   posture`). Add a `person` column so evaluation holds out whole people.

Public datasets (KIMORE, UI-PRMD) can be converted into the same columns by
computing the same joint angles and features from their skeletons.

## 2. Train and export

```bash
python -m venv .venv && . .venv/bin/activate
pip install -r training/requirements.txt
python training/train.py training/data/my_reps.csv --out public/models --name my-model --version 1
```

The template trains gradient-boosted trees, prints cross-validated error with
whole people held out, and writes `score.onnx`, `mistake.onnx` and
`manifest.json`. Replace the models in `make_score_model` /
`make_mistake_model` with anything `skl2onnx` converts.

To check the pipeline before you have real data, `npm run synthetic` writes a
labeled CSV from the demo simulator. Never ship a model trained on it.

## 3. Drop in

Put `manifest.json` and the `.onnx` files in `public/models/`, then rebuild
(`npm run build`) or push to `main` to redeploy. **Settings > Scoring** shows
which model is active, and each set summary says what scored it.

## Manifest format

```json
{
  "format": "rehabinated-model@1",
  "name": "rep-quality-gbm",
  "version": "1",
  "exercises": ["sit-to-stand", "mini-squat"],
  "inputs": ["range_frac", "path_error", "duration_ratio", "exercise:sit-to-stand", "exercise:mini-squat"],
  "normalize": { "mean": [0, 0, 0, 0, 0], "std": [1, 1, 1, 1, 1] },
  "score": { "file": "score.onnx", "output": "variable", "outputRange": [0, 100] },
  "mistake": {
    "file": "mistake.onnx",
    "probabilitiesOutput": "probabilities",
    "labelOutput": "label",
    "classes": ["good", "too_shallow", "too_fast"]
  }
}
```

| Key | Meaning |
| --- | --- |
| `exercises` | Exercise ids the model covers, or `["*"]`. |
| `inputs` | Model input columns in order: feature names, or `exercise:<id>` one-hot columns. Any subset works. |
| `normalize` | Optional `(x - mean) / std` per input, if your model expects scaled inputs. |
| `score.output` | Output tensor name (defaults to the first output). `outputRange` maps raw output to 0 to 100. |
| `mistake.probabilitiesOutput` / `labelOutput` | Output names for class probabilities (preferred) or the class index. |
| `mistake.classes` | Class order used in training. Every entry must be a known mistake id. |

Models take one float32 input of shape `[1, inputs.length]`. Any framework
works as long as it exports ONNX with that input: scikit-learn via
`skl2onnx` (use `zipmap: False` for classifiers), XGBoost/LightGBM via
`onnxmltools`, PyTorch via `torch.onnx.export`.

If the manifest is invalid or a model fails to load, the app logs why, shows
it in Settings, and keeps scoring with the rules.
