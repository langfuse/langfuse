import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";

// Self-hosted via next/font (downloaded at build, no runtime Google request).
// Family-agnostic export/var names: swapping the app font means changing the
// import + config here, plus the fallback stacks and the two
// --font-weight-* role values in globals.css — nothing else.
// The vars are declared on :root via a <style> tag in _app.tsx (next/font in
// _document silently drops its CSS), so portaled overlays outside #__next
// inherit them too.
export const appSans = IBM_Plex_Sans({
  weight: ["400", "500", "600"],
  subsets: ["latin"],
  variable: "--font-app-sans",
  display: "swap",
});

export const appMono = IBM_Plex_Mono({
  weight: ["400", "500", "600"],
  subsets: ["latin"],
  variable: "--font-app-mono",
  display: "swap",
});
