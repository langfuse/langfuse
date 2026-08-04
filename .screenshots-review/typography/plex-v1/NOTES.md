# Typography — IBM Plex draft v1 (uncommitted, for review)

Swap the app's system-font stacks for IBM Plex Sans (UI) + IBM Plex Mono
(code/IDs/data), self-hosted via next/font. No size or component changes in
this round — same scale, same weights, only the faces.

Before: Tailwind defaults (ui-sans-serif / ui-monospace — pure system fonts;
the app shipped no webfont at all). langfuse.com marketing uses Inter +
F37 Analog + Geist Mono, so app and site diverge either way.

Implementation (3 files, draft):
- `web/src/styles/fonts.ts` — next/font/google, weights 400/500/600.
- `web/src/pages/_app.tsx` — fonts must sit in the client component graph
  (in _document their CSS is silently dropped); vars declared on :root so
  portaled overlays outside #__next inherit them.
- `web/src/styles/globals.css` — non-inline @theme maps --font-sans/--font-mono
  (inline themes don't emit the :root vars preflight reads).

Kumo Text learnings applied/planned:
- Mono is a first-class text role (mono + mono-secondary), not just code
  styling — candidate phase 2: numeric table columns (latency, cost, tokens)
  in Plex Mono with tabular-nums.
- Their compact scale (body 14px) matches our existing --text-* scale; no
  size changes needed to adopt Plex.
- Phase 3 candidate: a `Text` component with role variants (heading1-3 /
  body / secondary / success / error / mono) and required `as` on headings.

Shots (before = system fonts, after = Plex): `1/2-traces`, `3/4-settings`.
Viewport: natural window size (1728x941), per updated convention.
