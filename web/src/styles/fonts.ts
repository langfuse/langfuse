import { IBM_Plex_Mono } from "next/font/google";

/** The app's mono. next/font bundles it at build time; the CSS variable is
    set on <html> in _document and consumed by `--font-mono` in globals.css. */
export const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-plex-mono",
  display: "swap",
});
