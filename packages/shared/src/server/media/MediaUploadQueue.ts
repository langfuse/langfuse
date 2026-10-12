/** Runs admitted uploads in FIFO order while bounding active work and bytes. */
export class MediaUploadQueue {
  private readonly queue: PendingUpload[] = [];
  private active = 0;
  private reservedBytes = 0;

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
      this.queue.push({
        bytes,
        ready,
      });
      this.pump();
    });

    try {
      return await work();
    } finally {
      this.active -= 1;
      this.reservedBytes -= bytes;
      this.pump();
    }
  }

  private pump(): void {
    while (this.queue.length > 0 && this.canStart(this.queue[0]!)) {
      const next = this.queue.shift()!;

      this.active += 1;
      this.reservedBytes += next.bytes;
      next.ready();
    }
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
