# Self-hosted IBM Plex Mono

`web/src/styles/fonts.ts` loads these two faces through `next/font/local` and
`--font-mono` in `globals.css` points at them, so they back every `font-mono`
surface: CodeMirror editors (the prompt editor, JSON viewers), code blocks and
ids.

## Provenance

- **Family** — IBM Plex Mono, version 2.3 (`fontRevision` 2.003).
- **Source** — the static TTFs in
  [`google/fonts@633f320:ofl/ibmplexmono`](https://github.com/google/fonts/tree/633f3200539c52ee0aba2dfd7f46921417a81877/ofl/ibmplexmono),
  converted to woff2 by the command below. The commit is pinned so the command
  reproduces these exact bytes.
- **License** — SIL Open Font License 1.1. `IBMPlexMono-OFL.txt` is the copy
  from that same commit, with line endings normalised to LF; keep the two
  together.

`IBMPlexMono-Bold.woff2` is the real Bold face (`usWeightClass` 700). It is
declared at CSS `weight: 600` in `fonts.ts` because `--font-weight-bold` is 600
in this app, so that is the weight the browser asks for.

## Coverage contract

**Ship every glyph the upstream family has — 930 codepoints — and do not
subset by script.**

A script subset is what broke this before: the files were once the Google Fonts
`latin` subset (230 codepoints), so Latin Extended-A, Cyrillic, Vietnamese and
the box-drawing block had no glyphs and browsers fell back **per character** to
a system monospace. The visible result is one line of text rendered in two
typefaces.

Subsetting to Google Fonts' published subsets instead (`latin`, `latin-ext`,
`cyrillic`, `cyrillic-ext`, `vietnamese`) is also not enough: their union is 678
codepoints and omits characters the full family has, such as U+2074 (⁴).

`web/src/styles/fonts.clienttest.ts` asserts this contract against the shipped
binaries.

IBM Plex Mono 2.3 has no Greek. Greek text falls back and there is no fix for
it here.

## Regenerating

Needs [`fonttools`](https://github.com/fonttools/fonttools) with Brotli
(`pip install 'fonttools[woff]'`).

```sh
upstream=633f3200539c52ee0aba2dfd7f46921417a81877
for weight in Regular Bold; do
  curl -sSLO "https://raw.githubusercontent.com/google/fonts/$upstream/ofl/ibmplexmono/IBMPlexMono-$weight.ttf"
  pyftsubset "IBMPlexMono-$weight.ttf" \
    --unicodes='*' \
    --layout-features='*' \
    --flavor=woff2 \
    --output-file="IBMPlexMono-$weight.woff2"
done
```

`--unicodes='*'` keeps every character, `--layout-features='*'` keeps every
OpenType feature, and the pass still drops `DSIG` and `meta`, which mean
nothing in a web font.

Keep the TrueType hinting tables (`cvt`, `fpgm`, `prep`, `gasp`) that this
produces. `--no-hinting` saves about 12 KB per face and changes how the text
renders on Windows.

To take a newer upstream release, move `upstream` to the commit you want and update the `IBMPlexMono` entry in `FAMILIES` in `fonts.clienttest.ts` and the version above in the same commit. The test failing on an upgrade is the contract working.

After regenerating, check against the files you replaced: codepoint coverage
must be a superset, and `unitsPerEm`, ascender, descender, cap height, x-height
and the advance widths must be unchanged — otherwise every monospace surface in
the app shifts.

# Self-hosted IBM Plex Sans

`web/src/styles/fonts.ts` loads one variable face through `next/font/local` and `--font-sans` in `globals.css` points at it, so it backs every sans surface in the app. The system sans stack stays behind it as the fallback.

## Provenance

- **Family** — IBM Plex Sans, version 3.201, upright. Variable on weight (100 to 700) and width (75 to 100); the app uses the weight axis only.
- **Source** — `IBMPlexSans[wdth,wght].ttf` in [`google/fonts@0b58fb3:ofl/ibmplexsans`](https://github.com/google/fonts/tree/0b58fb370093f9a9f4ff785d94405710b79de67c/ofl/ibmplexsans), converted to woff2 by the command below. The commit is pinned so the command reproduces these exact bytes.
- **License** — SIL Open Font License 1.1. `IBMPlexSans-OFL.txt` is the copy from that same commit, with line endings normalised to LF; keep the two together.

There is no italic face. Browsers slant the upright one for italic text, as they do for IBM Plex Mono.

## Matched to the system font

Layouts in this app were sized on the system font, so the face is matched to it (SF Pro, measured at 13px):

- `size-adjust: 102%` in `fonts.ts` equalises x-height.
- `ascent-override: 94.8%`, `descent-override: 20.69%` and `line-gap-override: 0%` give the face the system font's line metrics (ascent 0.967em, descent 0.211em; the overrides are multiplied by `size-adjust`). Browsers round ascent and descent to whole pixels, so without them 12px text sits a pixel lower and 9px text a pixel higher than in the system font. Safari ignores these three descriptors.
- The weight roles in `globals.css` are 400 / 480 / 540. The weights whose stroke matches the system font at 400 / 500 / 600 are 410 / 480 / 560; regular and bold are set slightly lighter than that by choice. Medium and bold need the variable weight axis, so do not swap the face for static weights without retuning them.

Digits are tabular by default (every digit has the same advance), so numbers line up with or without `tabular-nums`.

## Coverage contract

Same rule as IBM Plex Mono: **ship every glyph the upstream family has — 891 codepoints — and do not subset by script.** `fonts.clienttest.ts` asserts it.

That covers Latin, Latin Extended, Vietnamese, Cyrillic and Greek. The family has no CJK and no box drawing; those characters fall back to the system font.

The file keeps every glyph, but `unicode-range` in `fonts.ts` leaves out U+274C (❌). The family draws it as a plain text cross; without the glyph the browser uses the colour emoji, as it does for ✅.

## Regenerating

Same tooling as above.

```sh
upstream=0b58fb370093f9a9f4ff785d94405710b79de67c
curl -sSL -o 'IBMPlexSans[wdth,wght].ttf' \
  "https://raw.githubusercontent.com/google/fonts/$upstream/ofl/ibmplexsans/IBMPlexSans%5Bwdth%2Cwght%5D.ttf"
pyftsubset 'IBMPlexSans[wdth,wght].ttf' \
  --unicodes='*' \
  --layout-features='*' \
  --flavor=woff2 \
  --output-file=IBMPlexSans-Variable.woff2
```

To take a newer upstream release, move `upstream` and update the `IBMPlexSans` entry in `FAMILIES` in `fonts.clienttest.ts` and the version above in the same commit. Check the same things as for IBM Plex Mono, plus that the weight axis still spans the weight roles.
