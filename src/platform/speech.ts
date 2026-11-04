/** Spoken coaching. Web: speechSynthesis. Native: expo-speech or similar. */
export interface Speaker {
  say(text: string, opts?: { interrupt?: boolean }): void;
  setEnabled(on: boolean): void;
}
