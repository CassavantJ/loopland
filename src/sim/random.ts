/** A small seeded random number generator (mulberry32), so parks replay the same way. */
export class Random {
  state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(low: number, high: number): number {
    return low + (high - low) * this.next();
  }

  int(low: number, high: number): number {
    return Math.floor(this.range(low, high + 1));
  }

  pick<T>(items: readonly T[]): T {
    const item = items[Math.floor(this.next() * items.length)];
    if (item === undefined) throw new Error('pick from an empty list');
    return item;
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }
}
