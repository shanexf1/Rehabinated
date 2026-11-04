import type { InferenceRuntime, LoadedModel } from '../../platform/inference';

/** Runs .onnx files in the browser with onnxruntime-web (loaded only when a model exists). */
export function createOnnxRuntime(baseUrl: string): InferenceRuntime {
  return {
    async load(file: string): Promise<LoadedModel> {
      const ort = await import('onnxruntime-web/wasm');
      // Served from public/vendor (see scripts/vendor-assets.mjs).
      ort.env.wasm.wasmPaths = new URL('vendor/ort/', document.baseURI).href;
      const session = await ort.InferenceSession.create(new URL(file, baseUrl).href, { executionProviders: ['wasm'] });
      const inputName = session.inputNames[0];
      return {
        outputNames: session.outputNames,
        async run(input: Float32Array) {
          const tensor = new ort.Tensor('float32', input, [1, input.length]);
          const out = await session.run({ [inputName]: tensor });
          const flat: Record<string, ArrayLike<number>> = {};
          for (const [k, v] of Object.entries(out)) {
            const data = (v as { data: ArrayLike<number | bigint> }).data;
            flat[k] = Array.from(data as ArrayLike<number | bigint>, (x) => Number(x));
          }
          return flat;
        },
      };
    },
  };
}
