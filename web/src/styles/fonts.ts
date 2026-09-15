import localFont from "next/font/local";

export const plexMono = localFont({
  src: [
    {
      path: "./IBMPlexMono-Regular.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "./IBMPlexMono-Bold.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-plex-mono",
  display: "swap",
});
