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

To take a newer upstream release, move `upstream` to the commit you want and
update `UPSTREAM_CODEPOINT_COUNT` in `fonts.clienttest.ts` and the version
above in the same commit. The test failing on an upgrade is the contract
working.

After regenerating, check against the files you replaced: codepoint coverage
must be a superset, and `unitsPerEm`, ascender, descender, cap height, x-height
and the advance widths must be unchanged — otherwise every monospace surface in
the app shifts.
