import { Geist_Mono, IBM_Plex_Mono, JetBrains_Mono } from "next/font/google";
// Iosevka is not on Google Fonts; Fontsource ships it as a plain @font-face
// under the family name "Iosevka".
import "@fontsource/iosevka/400.css";

/** Trial monos for the JSON table values. Each is exposed as a CSS variable
    on <html>; the table swaps `--font-mono` in its own subtree. */
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-plex-mono",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-geist-mono",
  display: "swap",
});

export const trialMonoFontClasses = [
  plexMono.variable,
  jetbrainsMono.variable,
  geistMono.variable,
];
