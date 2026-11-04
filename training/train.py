"""
Train the two rep models and export them as drop-in files for the app.

    python training/train.py training/data/my_reps.csv --out public/models

Input: CSV(s) exported from the app (Settings > Data collection mode >
Export CSV), with the label_score and/or label_mistake columns filled in by
your raters. Output: score.onnx, mistake.onnx and manifest.json in --out.
Copy them into public/models/ and rebuild: the app uses them automatically.

This is a template. Swap the models in make_score_model / make_mistake_model
for anything skl2onnx can convert (or export your own ONNX from PyTorch and
write the manifest by hand; see docs/MODEL.md).
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingClassifier, GradientBoostingRegressor
from sklearn.metrics import accuracy_score, f1_score, mean_absolute_error
from sklearn.model_selection import GroupKFold

# Must match FEATURE_NAMES in src/core/features.ts (same order).
FEATURES = [
    "range_frac", "peak_shortfall_deg", "path_error", "duration_s", "duration_ratio",
    "to_target_ratio", "hold_s", "return_ratio", "jerk_index", "side_diff_deg",
    "posture_excess_deg", "confidence", "range_vs_first",
]
# Must match MISTAKES in src/core/types.ts.
KNOWN_MISTAKES = ["good", "too_shallow", "too_fast", "too_slow", "dropped", "jerky", "off_path", "uneven", "posture"]


def make_score_model():
    return GradientBoostingRegressor(n_estimators=150, max_depth=3, learning_rate=0.05, subsample=0.9, random_state=0)


def make_mistake_model():
    return GradientBoostingClassifier(n_estimators=150, max_depth=3, learning_rate=0.05, subsample=0.9, random_state=0)


def load(paths: list[str]) -> pd.DataFrame:
    df = pd.concat([pd.read_csv(p) for p in paths], ignore_index=True)
    missing = [c for c in FEATURES + ["exercise_id", "set_id"] if c not in df.columns]
    if missing:
        raise SystemExit(f"CSV is missing columns: {missing}")
    return df


def design_matrix(df: pd.DataFrame, exercises: list[str]) -> tuple[np.ndarray, list[str]]:
    cols = FEATURES + [f"exercise:{e}" for e in exercises]
    X = df[FEATURES].astype(float).fillna(0.0).to_numpy()
    onehot = np.stack([(df["exercise_id"] == e).astype(float).to_numpy() for e in exercises], axis=1)
    return np.concatenate([X, onehot], axis=1).astype(np.float32), cols


def cv_report(make, X, y, groups, kind: str):
    """Cross-validate with whole groups (people or sets) held out, never split across folds."""
    n = min(5, len(set(groups)))
    if n < 2:
        print(f"  [{kind}] not enough groups for cross-validation")
        return
    preds = np.empty_like(y)
    for tr, te in GroupKFold(n_splits=n).split(X, y, groups):
        m = make().fit(X[tr], y[tr])
        preds[te] = m.predict(X[te])
    if kind == "score":
        print(f"  [score] cross-validated MAE: {mean_absolute_error(y, preds):.1f} points")
    else:
        print(f"  [mistake] cross-validated accuracy: {accuracy_score(y, preds):.2f}, macro F1: {f1_score(y, preds, average='macro'):.2f}")


def to_onnx(model, n_inputs: int, path: Path, classifier: bool):
    from skl2onnx import convert_sklearn
    from skl2onnx.common.data_types import FloatTensorType

    options = {id(model): {"zipmap": False}} if classifier else None
    onx = convert_sklearn(model, initial_types=[("input", FloatTensorType([None, n_inputs]))], options=options, target_opset=17)
    path.write_bytes(onx.SerializeToString())


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("csv", nargs="+", help="exported rep CSV file(s) with labels filled in")
    ap.add_argument("--out", default="public/models", help="where to write manifest.json and .onnx files")
    ap.add_argument("--name", default="rep-quality-gbm")
    ap.add_argument("--version", default="1")
    ap.add_argument("--group-col", default="person", help="column to hold out in cross-validation (falls back to set_id)")
    args = ap.parse_args()

    df = load(args.csv)
    if (df.get("source") == "synthetic").any():
        print("WARNING: training on synthetic simulator data. Use this only to test the pipeline, never in the app.")
    exercises = sorted(df["exercise_id"].unique())
    X_all, inputs = design_matrix(df, exercises)
    group_col = args.group_col if args.group_col in df.columns else "set_id"
    groups_all = df[group_col].astype(str).to_numpy()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    manifest: dict = {
        "format": "rehabinated-model@1",
        "name": args.name,
        "version": str(args.version),
        "exercises": exercises,
        "inputs": inputs,
    }

    has_score = "label_score" in df and df["label_score"].notna().any()
    if has_score:
        m = df["label_score"].notna().to_numpy()
        X, y, g = X_all[m], df.loc[m, "label_score"].astype(float).to_numpy(), groups_all[m]
        print(f"Score model: {len(y)} labeled reps")
        cv_report(make_score_model, X, y, g, "score")
        model = make_score_model().fit(X, y)
        to_onnx(model, X.shape[1], out / "score.onnx", classifier=False)
        manifest["score"] = {"file": "score.onnx", "output": "variable", "outputRange": [0, 100]}

    has_mistake = "label_mistake" in df and df["label_mistake"].notna().any()
    if has_mistake:
        m = df["label_mistake"].notna().to_numpy()
        labels = df.loc[m, "label_mistake"].astype(str)
        unknown = sorted(set(labels) - set(KNOWN_MISTAKES))
        if unknown:
            raise SystemExit(f"Unknown mistake labels {unknown}. Allowed: {KNOWN_MISTAKES}")
        classes = sorted(set(labels), key=KNOWN_MISTAKES.index)
        # Integer targets so the ONNX label output is numeric.
        y = labels.map({c: i for i, c in enumerate(classes)}).to_numpy()
        X, g = X_all[m], groups_all[m]
        print(f"Mistake model: {len(y)} labeled reps, classes {classes}")
        cv_report(make_mistake_model, X, y, g, "mistake")
        model = make_mistake_model().fit(X, y)
        to_onnx(model, X.shape[1], out / "mistake.onnx", classifier=True)
        manifest["mistake"] = {
            "file": "mistake.onnx",
            "probabilitiesOutput": "probabilities",
            "labelOutput": "label",
            "classes": classes,
        }

    if not (has_score or has_mistake):
        raise SystemExit("No labels found. Fill in label_score and/or label_mistake before training.")

    (out / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"Wrote {out / 'manifest.json'} and model files. Rebuild the app to use them.")


if __name__ == "__main__":
    main()
