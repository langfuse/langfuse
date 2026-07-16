import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";

// Self-hosted via next/font (downloaded at build, no runtime Google request).
// The variable classNames only declare CSS custom properties, so they are
// attached to <body> in _document.tsx — that way portaled overlays (the
// [data-overlay-root] layer containers are <body> children outside #__next)
// inherit the fonts too. Tailwind's font-sans/font-mono utilities and the
// preflight body default resolve to these vars via @theme in globals.css.
export const plexSans = IBM_Plex_Sans({
  weight: ["400", "500", "600"],
  subsets: ["latin"],
  variable: "--font-plex-sans",
  display: "swap",
});

export const plexMono = IBM_Plex_Mono({
  weight: ["400", "500", "600"],
  subsets: ["latin"],
  variable: "--font-plex-mono",
  display: "swap",
});
