/** 快照式撤销重做；连续的同类调整（同一 key、间隔很短）合并为一步 */

const LIMIT = 200;
const COALESCE_MS = 800;

export class History<T> {
  private past: T[] = [];
  private future: T[] = [];
  private lastKey: string | undefined;
  private lastAt = 0;
  present: T;

  constructor(initial: T) {
    this.present = initial;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  commit(next: T, key?: string): void {
    const now = Date.now();
    const merge = key !== undefined && key === this.lastKey && now - this.lastAt < COALESCE_MS && this.past.length > 0;
    if (!merge) {
      this.past.push(this.present);
      if (this.past.length > LIMIT) this.past.shift();
    }
    this.present = next;
    this.future = [];
    this.lastKey = key;
    this.lastAt = now;
  }

  undo(): T | null {
    const prev = this.past.pop();
    if (prev === undefined) return null;
    this.future.push(this.present);
    this.present = prev;
    this.lastKey = undefined;
    return prev;
  }

  redo(): T | null {
    const next = this.future.pop();
    if (next === undefined) return null;
    this.past.push(this.present);
    this.present = next;
    this.lastKey = undefined;
    return next;
  }
}
