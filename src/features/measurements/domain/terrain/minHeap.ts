/** Compact binary min-heap keyed by `Float64Array` priorities for A* search. */
export class MinHeap {
  private indices: Int32Array;
  private priorities: Float64Array;
  public size = 0;

  constructor(capacity: number) {
    this.indices = new Int32Array(Math.max(16, capacity));
    this.priorities = new Float64Array(Math.max(16, capacity));
  }

  push(index: number, priority: number): void {
    if (this.size >= this.indices.length) {
      const nextCap = this.indices.length * 2;
      const nextIdx = new Int32Array(nextCap);
      const nextPri = new Float64Array(nextCap);
      nextIdx.set(this.indices);
      nextPri.set(this.priorities);
      this.indices = nextIdx;
      this.priorities = nextPri;
    }
    let pos = this.size++;
    while (pos > 0) {
      const parent = (pos - 1) >> 1;
      if (this.priorities[parent] <= priority) break;
      this.indices[pos] = this.indices[parent];
      this.priorities[pos] = this.priorities[parent];
      pos = parent;
    }
    this.indices[pos] = index;
    this.priorities[pos] = priority;
  }

  pop(): number {
    const top = this.indices[0];
    const lastIdx = --this.size;
    if (lastIdx > 0) {
      const movedIndex = this.indices[lastIdx];
      const movedPri = this.priorities[lastIdx];
      let pos = 0;
      const half = lastIdx >> 1;
      while (pos < half) {
        let child = (pos << 1) + 1;
        const right = child + 1;
        if (right < lastIdx && this.priorities[right] < this.priorities[child]) {
          child = right;
        }
        if (movedPri <= this.priorities[child]) break;
        this.indices[pos] = this.indices[child];
        this.priorities[pos] = this.priorities[child];
        pos = child;
      }
      this.indices[pos] = movedIndex;
      this.priorities[pos] = movedPri;
    }
    return top;
  }
}
