import type { Speaker } from '../../platform/speech';

export function createWebSpeaker(): Speaker {
  let enabled = true;
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
  return {
    say(text, opts) {
      if (!enabled || !synth) return;
      if (opts?.interrupt) synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 0.95;
      synth.speak(u);
    },
    setEnabled(on) {
      enabled = on;
      if (!on) synth?.cancel();
    },
  };
}
