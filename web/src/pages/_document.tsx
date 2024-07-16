import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="en">
      <Head />
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
// See: https://vercel.com/docs/observability/otel-overview

import { setSigtermReceived } from "@/src/utils/shutdown";
import prexit from "prexit";

if (process.env.NEXT_MANUAL_SIG_HANDLE) {
  // process.on("SIGTERM", async () => {
  //   await shutdown();
  // });

  // process.on("SIGINT", async () => {
  //   await shutdown();
  // });
  prexit(async (signal) => {
    console.log("Signal: ", signal);
    return await shutdown();
  });
}

export const shutdown = async () => {
  console.log("SIGTERM / SIGINT received. Shutting down");
  setSigtermReceived();

  // wait for 15 seconds
  return await new Promise<void>((resolve) => {
    setTimeout(() => {
      console.log("Shutdown complete");
      resolve();
    }, 15000);
  });
};
