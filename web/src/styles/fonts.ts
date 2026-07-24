/**
 * App webfonts, loaded via next/font (self-hosted at build time — no runtime
 * requests to Google). This is the deferred-font plan from globals.css: the
 * loader exposes a CSS variable that _app declares on :root (next/font CSS is
 * silently dropped in _document), and globals.css prepends that variable to
 * the font stack so everything stays font-relative.
 *
 * Geist Mono (OFL) is the sessions-handoff mono — numerals, IDs, code,
 * eyebrow labels. The handoff's display face (F37 Analog) is a COMMERCIAL
 * font and is deliberately NOT loaded here: display text falls back to the
 * sans stack until the license/files are provided.
 */
import { Geist_Mono } from "next/font/google";

export const geistMono = Geist_Mono({
  subsets: ["latin"],
  display: "swap",
  // No `variable`: _app writes the family onto :root itself (see fonts note
  // in globals.css) so portalled content (Radix menus, tooltips) inherits it.
});
