/**
 * Runs a model file. The web app implements this with onnxruntime-web; a
 * React Native app would implement it with onnxruntime-react-native. The
 * core never imports either library directly.
 */
export interface InferenceRuntime {
  /** Load a model by path relative to the models folder. */
  load(file: string): Promise<LoadedModel>;
}

export interface LoadedModel {
  /** Names of the model's outputs, in order. */
  readonly outputNames: readonly string[];
  /** Run on a single input row (shape [1, n]); returns each output flattened. */
  run(input: Float32Array): Promise<Record<string, ArrayLike<number>>>;
}
