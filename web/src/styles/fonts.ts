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

// Matched to the system font: x-height via `size-adjust`, line metrics via the
// overrides. The range leaves U+274C to the emoji font. No generated Arial
// fallback, so the system stack is the fallback.
const plexSans = localFont({
  src: "../../public/fonts/IBMPlexSans-Variable.woff2",
  weight: "100 700",
  style: "normal",
  variable: "--font-plex-sans",
  display: "swap",
  adjustFontFallback: false,
  declarations: [
    { prop: "size-adjust", value: "102%" },
    { prop: "ascent-override", value: "94.8%" },
    { prop: "descent-override", value: "20.69%" },
    { prop: "line-gap-override", value: "0%" },
    { prop: "unicode-range", value: "U+0-274B, U+274D-10FFFF" },
  ],
});

/** Class names that declare the font variables; set on `<html>` and the app root. */
export const fontVariables = `${plexMono.variable} ${plexSans.variable}`;
