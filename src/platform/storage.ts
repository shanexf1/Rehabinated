/** Key-value storage. Web: localStorage. Native: AsyncStorage. Async so both fit. */
export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}
