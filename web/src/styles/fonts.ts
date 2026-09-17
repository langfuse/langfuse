import localFont from "next/font/local";

export const plexMono = localFont({
  src: [
    {
      path: "./IBMPlexMono-Regular.woff2",
      weight: "400",
      style: "normal",
    },
    {
      // 600 is this app's bold role (--font-weight-bold), not a 700.
      path: "./IBMPlexMono-Bold.woff2",
      weight: "600",
      style: "normal",
    },
  ],
  variable: "--font-plex-mono",
  display: "swap",
});
