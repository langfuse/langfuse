"use client";

import { ReactNode } from "react";
import { ThemeProvider } from "next-themes";
import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";

import dynamic from "next/dynamic";
import Provider from "@/src/app/_trpc/Provider";
// const Toaster = dynamic(() =>
//   import("@/components/ui/toaster").then((mod) => mod.Toaster)
// );
// import { Toaster } from

// Check that PostHog is client-side (used to handle Next.js SSR) and that env vars are set
if (
  typeof window !== "undefined" &&
  process.env.NEXT_PUBLIC_POSTHOG_KEY &&
  process.env.NEXT_PUBLIC_POSTHOG_HOST
) {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://eu.posthog.com",
    // Enable debug mode in development
    loaded: (posthog) => {
      if (process.env.NODE_ENV === "development") posthog.debug();
    },
  });
}

type Props = {
  children: ReactNode;
};

function Providers({ children }: Props) {
  return (
    // <PostHogProvider client={posthog}>
      <ThemeProvider attribute="class" enableSystem>
        {/* <Toaster /> */}
        {/* {children} */}
        <Provider>{children}</Provider>
      </ThemeProvider>
    // </PostHogProvider>
  );
}

export default Providers;
