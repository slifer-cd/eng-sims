/** Disjoint sets over string keys, with path compression. */
export class UnionFind {
  private parent = new Map<string, string>();
  add(k: string) {
    if (!this.parent.has(k)) this.parent.set(k, k);
  }
  has(k: string) {
    return this.parent.has(k);
  }
  find(k: string): string {
    let r = k;
    while (this.parent.get(r) !== r) r = this.parent.get(r)!;
    // Path compression.
    while (k !== r) {
      const next = this.parent.get(k)!;
      this.parent.set(k, r);
      k = next;
    }
    return r;
  }
  union(a: string, b: string) {
    this.parent.set(this.find(a), this.find(b));
  }
  keys() {
    return this.parent.keys();
  }
}
