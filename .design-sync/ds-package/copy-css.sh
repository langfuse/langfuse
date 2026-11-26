#!/usr/bin/env bash
# Copies Storybook's compiled Tailwind v4 stylesheet (the one iframe.html links)
# into the shim package so cfg.cssEntry can append it to _ds_bundle.css.
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel)"
SB="$ROOT/.design-sync/sb-reference"
HREF="$(grep -o '<link rel="stylesheet"[^>]*href="[^"]*"' "$SB/iframe.html" | sed -E 's/.*href="\.?\/?([^"]*)".*/\1/' | head -1)"
cp "$SB/$HREF" "$ROOT/.design-sync/ds-package/storybook-compiled.css"
echo "copied $HREF -> .design-sync/ds-package/storybook-compiled.css"
# Storybook (like the bundle) has no next/font, so --font-plex-mono is unset and
# font-mono falls back to the literal "IBM Plex Mono" family. Give the reference
# the same @font-face the bundle ships (cfg.extraFonts plex-mono.css) so the
# compare oracle verifies with the real font. Fonts are served from staticDirs.
if ! grep -q 'data-ds-sync-fonts' "$SB/iframe.html"; then
  FACES='<style data-ds-sync-fonts>@font-face{font-family:"IBM Plex Mono";src:url("./fonts/IBMPlexMono-Regular.woff2") format("woff2");font-weight:400;font-style:normal}@font-face{font-family:"IBM Plex Mono";src:url("./fonts/IBMPlexMono-Bold.woff2") format("woff2");font-weight:600;font-style:normal}</style>'
  FACES="$FACES" perl -0pi -e 's|</head>|$ENV{FACES}</head>|' "$SB/iframe.html"
  echo "injected IBM Plex Mono @font-face into sb-reference/iframe.html"
fi
# The reference server has no svg MIME type, so web/public images break there
# too; inject gen-entry.sh's public-assets.js (refreshed on every run).
ASSETS_JS="$(cat "$ROOT/.design-sync/ds-package/public-assets.js")"
ASSETS_JS="$ASSETS_JS" perl -0pi -e 's|<script data-ds-sync-assets>.*?</script>||s; s|</head>|<script data-ds-sync-assets>$ENV{ASSETS_JS}</script></head>|' "$SB/iframe.html"
echo "injected public-assets.js into sb-reference/iframe.html"
