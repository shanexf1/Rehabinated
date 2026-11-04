import type { KeyValueStore } from '../../platform/storage';

/** localStorage wrapped in the async KeyValueStore shape (AsyncStorage on native). */
export const localStore: KeyValueStore = {
  async get(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  async set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Private mode or full storage: progress just won't persist.
    }
  },
};
