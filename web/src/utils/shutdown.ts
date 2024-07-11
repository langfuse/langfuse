let sigtermReceived = false;

process.on("SIGTERM", () => {
  sigtermReceived = true;
});

declare global {
  // eslint-disable-next-line no-var
  var sigtermReceived: boolean;
}

globalThis.sigtermReceived = sigtermReceived;

export const SIGTERM_RECEIVED = globalThis.sigtermReceived;

if (process.env.NODE_ENV !== "production")
  globalThis.sigtermReceived = sigtermReceived;
