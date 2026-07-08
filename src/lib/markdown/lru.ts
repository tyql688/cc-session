export class LruCache<K, V> {
  private readonly values = new Map<K, V>();

  constructor(private readonly capacity: number) {}

  get(key: K): V | undefined {
    const value = this.values.get(key);
    if (value === undefined) return undefined;
    this.values.delete(key);
    this.values.set(key, value);
    return value;
  }

  set(key: K, value: V): void {
    if (this.values.has(key)) {
      this.values.delete(key);
    } else if (this.values.size >= this.capacity) {
      const oldest = this.values.keys().next().value;
      if (oldest !== undefined) this.values.delete(oldest);
    }
    this.values.set(key, value);
  }

  clear(): void {
    this.values.clear();
  }
}
