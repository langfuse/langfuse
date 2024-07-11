let sigtermReceived = false;

// export const SIGTERM_RECEIVED = globalThis.sigtermReceived;

// if (process.env.NODE_ENV !== "production")
//   globalThis.sigtermReceived = sigtermReceived;

export const setSigtermReceived = () => {
  sigtermReceived = true;
};

export const isSigtermReceived = () =>
  Boolean(process.env.NEXT_MANUAL_SIG_HANDLE) && sigtermReceived;

// export const cleanUp = async () => {
//   await prisma.$disconnect();

//   // wait for 5 seconds
//   await new Promise((resolve) => setTimeout(resolve, 5000));

//   console.log("Disconnected from Postgres");
// };
