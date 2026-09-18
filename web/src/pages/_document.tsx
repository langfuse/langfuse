import { Html, Head, Main, NextScript } from "next/document";
import { plexMono, plexSans } from "@/src/styles/fonts";

export default function Document() {
  return (
    // lang is set explicitly (not left to the i18n config, which is being
    // phased out in App Router) so screen readers always get the document
    // language — WCAG 2.1 SC 3.1.1.
    // next-themes mutates class/style on <html> before hydration; suppress the
    // expected mismatch one level deep (React 19 logs it and can re-render).
    <Html
      lang="en"
      suppressHydrationWarning
      className={`${plexSans.variable} ${plexMono.variable}`}
    >
      <Head />
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
