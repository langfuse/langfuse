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

// UI font candidates for the font preview switcher. `size-adjust` scales each
// to the system font's x-height; none is preloaded because only the selected
// one is used.
const publicSans = localFont({
  src: "../../public/fonts/PublicSans-Variable.woff2",
  weight: "100 900",
  variable: "--font-public-sans",
  display: "swap",
  preload: false,
  declarations: [{ prop: "size-adjust", value: "101.8%" }],
});

const plexSans = localFont({
  src: "../../public/fonts/IBMPlexSans-Variable.woff2",
  weight: "100 700",
  variable: "--font-plex-sans",
  display: "swap",
  preload: false,
  declarations: [{ prop: "size-adjust", value: "102%" }],
});

const atkinsonHyperlegibleNext = localFont({
  src: "../../public/fonts/AtkinsonHyperlegibleNext-Variable.woff2",
  weight: "200 800",
  variable: "--font-atkinson-hyperlegible-next",
  display: "swap",
  preload: false,
  declarations: [{ prop: "size-adjust", value: "106.1%" }],
});

/** Class names that declare every font variable; set on `<html>` and the app root. */
export const fontVariables = [
  plexMono.variable,
  publicSans.variable,
  plexSans.variable,
  atkinsonHyperlegibleNext.variable,
].join(" ");
