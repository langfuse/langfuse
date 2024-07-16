declare global {
  // eslint-disable-next-line no-var
  var sigtermReceived: boolean | undefined;
}

globalThis.sigtermReceived = globalThis.sigtermReceived ?? false;

export const setSigtermReceived = () => {
  console.log("Set sigterm received to true");
  globalThis.sigtermReceived = true;
};

export const isSigtermReceived = () =>
  Boolean(process.env.NEXT_MANUAL_SIG_HANDLE) && globalThis.sigtermReceived;

export const shutdown = async (signal: PrexitSignal) => {
  if (signal === "SIGTERM" || signal === "SIGINT") {
    console.log("SIGTERM / SIGINT received. Shutting down in 20 seconds.");
    setSigtermReceived();

    // wait for 15 seconds
    return await new Promise<void>((resolve) => {
      setTimeout(() => {
        console.log("Shutdown complete");
        resolve();
      }, 20000);
    });
  }
};
