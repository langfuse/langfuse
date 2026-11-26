/**
 * Bounds active uploads and their decoded bytes. Waiting `run()` calls pause
 * until admitted; admission reserves capacity before waking them. Each settled
 * upload admits more work, so progress requires active uploads to settle.
 * Oversized uploads run alone.
 *
 * A fitting upload may bypass the oldest waiter up to `concurrency` times.
 * Work must enforce its own timeout; its reservation lasts until it settles.
 */
export class MediaUploadPool {
  private waiting: Array<PendingUpload | undefined> = [];
  private first = 0;
  private capacity = 1;
  private minBytes = [Infinity, Infinity];
  private active = 0;
  private reservedBytes = 0;
  private bypasses = 0;

  constructor(
    private readonly concurrency: number,
    private readonly maxBytes: number,
  ) {
    if (!Number.isSafeInteger(concurrency) || concurrency <= 0) {
      throw new Error(
        "Media upload concurrency must be a positive safe integer",
      );
    }
    if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
      throw new Error(
        "Media upload byte limit must be a positive safe integer",
      );
    }
  }

  async run<T>(bytes: number, work: () => Promise<T>): Promise<T> {
    if (!Number.isSafeInteger(bytes) || bytes < 0) {
      throw new Error("Media upload size must be a non-negative safe integer");
    }

    await new Promise<void>((ready) => {
      const upload = { bytes, ready };
      if (
        this.waiting.length === 0 &&
        this.active < this.concurrency &&
        (this.active === 0 || bytes <= this.maxBytes - this.reservedBytes)
      ) {
        this.bypasses = 0;
        this.admit(upload);
        return;
      }
      this.waiting.push(upload);
      if (this.waiting.length > this.capacity) {
        this.capacity *= 2;
        this.rebuildIndex();
      } else {
        this.setSize(this.waiting.length - 1, bytes);
      }
      this.admitFittingWaiters();
    });

    try {
      return await work();
    } finally {
      this.active -= 1;
      this.reservedBytes -= bytes;
      this.admitFittingWaiters();
    }
  }

  // Each call wakes at most the number of slots free when it begins. Waitlist
  // compaction can still scan the full backlog.
  private admitFittingWaiters(): void {
    while (this.active < this.concurrency && this.waiting.length > 0) {
      const available =
        this.active === 0
          ? Number.MAX_SAFE_INTEGER
          : this.maxBytes - this.reservedBytes;
      const index = this.firstFitting(available);
      if (index === undefined) return;
      const bypass = index !== this.first;
      if (bypass && this.bypasses >= this.concurrency) return;

      const upload = this.waiting[index]!;
      this.removeWaiting(index);
      this.bypasses = bypass ? this.bypasses + 1 : 0;
      this.admit(upload);
    }
  }

  // Each subtree stores its smallest reservation, so this finds the earliest fit.
  private firstFitting(bytes: number): number | undefined {
    if (this.minBytes[1]! > bytes) return undefined;
    let node = 1;
    while (node < this.capacity) {
      node = this.minBytes[node * 2]! <= bytes ? node * 2 : node * 2 + 1;
    }
    return node - this.capacity;
  }

  private removeWaiting(index: number): void {
    this.waiting[index] = undefined;
    this.setSize(index, Infinity);
    while (this.first < this.waiting.length && !this.waiting[this.first]) {
      this.first++;
    }
    if (this.first === this.waiting.length) {
      this.waiting = [];
      this.first = 0;
      this.capacity = 1;
      this.minBytes = [Infinity, Infinity];
    } else if (this.first >= 1024 && this.first * 2 >= this.waiting.length) {
      this.waiting = this.waiting.slice(this.first);
      this.first = 0;
      this.capacity = 1;
      while (this.capacity < this.waiting.length) this.capacity *= 2;
      this.rebuildIndex();
    }
  }

  private setSize(index: number, bytes: number): void {
    let node = this.capacity + index;
    this.minBytes[node] = bytes;
    while (node > 1) {
      node = Math.floor(node / 2);
      this.minBytes[node] = Math.min(
        this.minBytes[node * 2]!,
        this.minBytes[node * 2 + 1]!,
      );
    }
  }

  private rebuildIndex(): void {
    this.minBytes = new Array<number>(this.capacity * 2).fill(Infinity);
    for (let index = 0; index < this.waiting.length; index++) {
      const upload = this.waiting[index];
      if (upload) this.minBytes[this.capacity + index] = upload.bytes;
    }
    for (let node = this.capacity - 1; node > 0; node--) {
      this.minBytes[node] = Math.min(
        this.minBytes[node * 2]!,
        this.minBytes[node * 2 + 1]!,
      );
    }
  }

  private admit(upload: PendingUpload): void {
    this.active += 1;
    this.reservedBytes += upload.bytes;
    upload.ready();
  }
}

type PendingUpload = {
  bytes: number;
  ready: () => void;
};
