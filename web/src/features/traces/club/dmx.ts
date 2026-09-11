const BRIDGE = "http://127.0.0.1:9097";
const FRAME_INTERVAL_MS = 25;

/** Browser-only transport for the explicitly started local USB DMX bridge. */
export class DmxOutput {
  private session: string | null = null;
  private sequence = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private pending: readonly number[] | null = null;
  private sending = false;
  private closed = false;

  constructor(private readonly onError?: (error: Error) => void) {}

  async connect(): Promise<void> {
    if (window.location.origin !== "http://localhost:3000") {
      throw new Error(
        "Room lights are available at http://localhost:3000 only.",
      );
    }
    if (this.session || this.closed) return;
    try {
      const response = await fetch(`${BRIDGE}/status`, {
        cache: "no-store",
        credentials: "omit",
        redirect: "error",
        signal: AbortSignal.timeout(2000),
      });
      const status: unknown = await response.json();
      if (
        !response.ok ||
        typeof status !== "object" ||
        status === null ||
        !("bridge" in status) ||
        status.bridge !== "langfuse-trace-club" ||
        !("ready" in status) ||
        status.ready !== true
      ) {
        throw new Error("The DMX bridge is not ready.");
      }
      const connected: unknown = await this.post("/connect", {});
      if (
        typeof connected !== "object" ||
        connected === null ||
        !("session" in connected) ||
        typeof connected.session !== "string"
      ) {
        throw new Error("The DMX bridge did not establish a session.");
      }
      this.session = connected.session;
      if (this.closed) {
        this.blackout();
        this.session = null;
        return;
      }
      this.timer = setInterval(() => {
        this.flush();
      }, FRAME_INTERVAL_MS);
    } catch {
      throw new Error(
        "Lights unavailable. Start python3 scripts/trace-club/dmx_bridge.py and allow local network access.",
      );
    }
  }

  set(channels: readonly number[]): void {
    if (!this.session || this.closed) return;
    if (
      channels.length !== 6 ||
      channels.some((value) => !Number.isFinite(value))
    ) {
      this.blackout();
      this.onError?.(new Error("DMX needs six finite channel values."));
      return;
    }
    this.pending = channels.map((value) =>
      Math.max(0, Math.min(255, Math.round(value))),
    );
  }

  blackout(): void {
    this.pending = null;
    if (!this.session) return;
    // Sequence ordering prevents an older in-flight frame relighting after Stop.
    this.post("/blackout", {
      session: this.session,
      sequence: ++this.sequence,
    }).catch(() => {
      // The bridge also blacks out when frame updates stop for 750 ms.
    });
  }

  close(): void {
    this.closed = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.blackout();
    this.session = null;
  }

  private async flush(): Promise<void> {
    if (this.sending || !this.pending || !this.session || this.closed) return;
    const channels = this.pending;
    this.pending = null;
    this.sending = true;
    try {
      await this.post("/frame", {
        session: this.session,
        sequence: ++this.sequence,
        channels,
      });
    } catch {
      if (!this.closed) {
        this.close();
        this.onError?.(
          new Error(
            "Room lights disconnected. Reconnect the DMX bridge to try again.",
          ),
        );
      }
    } finally {
      this.sending = false;
    }
  }

  private async post(path: string, body: object): Promise<unknown> {
    const response = await fetch(`${BRIDGE}${path}`, {
      method: "POST",
      credentials: "omit",
      redirect: "error",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: path === "/blackout",
      signal: AbortSignal.timeout(1000),
    });
    if (!response.ok) throw new Error("DMX bridge request failed.");
    return response.json();
  }
}
