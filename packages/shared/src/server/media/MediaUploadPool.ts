/**
 * Bounds active uploads and decoded bytes. Fitting work may bypass the oldest
 * waiter up to `concurrency` times; then new work waits until it starts.
 * The upload must reject on timeout itself. This pool keeps its reservation
 * until work actually settles; timing out only the waiter would free it too soon.
 */
export class MediaUploadPool {
  private waiting: PendingUpload[] = [];
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
      if (!this.startIfPossible(upload)) this.waiting.push(upload);
    });

    try {
      return await work();
    } finally {
      this.active -= 1;
      this.reservedBytes -= bytes;
      this.startWaiting();
    }
  }

  private startWaiting(): void {
    const waiting = this.waiting;
    this.waiting = [];
    for (const upload of waiting) {
      if (!this.startIfPossible(upload)) this.waiting.push(upload);
    }
  }

  private startIfPossible(upload: PendingUpload): boolean {
    if (!this.canStart(upload)) return false;
    const hasOlderWaiters = this.waiting.length > 0;
    if (hasOlderWaiters && this.bypasses >= this.concurrency) return false;
    this.bypasses = hasOlderWaiters ? this.bypasses + 1 : 0;
    this.start(upload);
    return true;
  }

  private start(upload: PendingUpload): void {
    this.active += 1;
    this.reservedBytes += upload.bytes;
    upload.ready();
  }

  private canStart(next: PendingUpload): boolean {
    if (this.active >= this.concurrency) return false;
    if (this.active === 0) return true;

    return (
      this.reservedBytes <= this.maxBytes &&
      next.bytes <= this.maxBytes - this.reservedBytes
    );
  }
}

type PendingUpload = {
  bytes: number;
  ready: () => void;
};
