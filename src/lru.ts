/** A map that keeps only the `max` most recently used entries. */
export class Lru<K, V> {
  private map = new Map<K, V>();
  constructor(private max: number) {}

  get size() {
    return this.map.size;
  }

  /** The value for `key`, which becomes the most recently used. */
  get(key: K): V | undefined {
    if (!this.map.has(key)) return undefined;
    const value = this.map.get(key)!;
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key: K, value: V) {
    this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > this.max) this.map.delete(this.map.keys().next().value!);
  }

  /** Forget `key`; with `only`, only while it still holds that value (not one set again since). */
  delete(key: K, only?: V) {
    if (only === undefined || this.map.get(key) === only) this.map.delete(key);
  }
}
