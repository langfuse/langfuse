import { prisma } from "@langfuse/shared/src/db";

// let sigtermReceived = false;

declare global {
  // eslint-disable-next-line no-var
  var sigtermReceived: boolean;
}

// globalThis.sigtermReceived = sigtermReceived;

// export const SIGTERM_RECEIVED = globalThis.sigtermReceived;

// if (process.env.NODE_ENV !== "production")
//   globalThis.sigtermReceived = sigtermReceived;

export const setSigtermReceived = () => {
  globalThis.sigtermReceived = true;
};

export const isSigtermReceived = () => globalThis.sigtermReceived;

// export const cleanUp = async () => {
//   await prisma.$disconnect();

//   // wait for 5 seconds
//   await new Promise((resolve) => setTimeout(resolve, 5000));

//   console.log("Disconnected from Postgres");
// };
