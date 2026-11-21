import localFont from "next/font/local";

const plexMono = localFont({
  src: [
    {
      path: "../../public/fonts/IBMPlexMono-Regular.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../public/fonts/IBMPlexMono-Bold.woff2",
      weight: "600",
      style: "normal",
    },
  ],
  variable: "--font-plex-mono",
  display: "swap",
});

// `size-adjust` scales the face to the system font's x-height.
const plexSans = localFont({
  src: "../../public/fonts/IBMPlexSans-Variable.woff2",
  weight: "100 700",
  style: "normal",
  variable: "--font-plex-sans",
  display: "swap",
  declarations: [{ prop: "size-adjust", value: "102%" }],
});

/** Class names that declare the font variables; set on `<html>` and the app root. */
export const fontVariables = `${plexMono.variable} ${plexSans.variable}`;
