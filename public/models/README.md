# Drop trained models here

Put `manifest.json` plus your `.onnx` files in this folder, then rebuild or
redeploy. The app picks them up automatically. With no `manifest.json` here,
the built-in rule scorer is used.

See `docs/MODEL.md` for the manifest format, and `training/` for a script
that trains and exports both files. `manifest.example.json` shows the shape.
