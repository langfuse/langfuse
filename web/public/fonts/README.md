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

# Self-hosted UI font candidates

`fonts.ts` loads three variable sans faces for the font preview switcher
(`src/features/font-preview`). The switcher sets `data-font-preview` on
`<html>`, and `globals.css` swaps `--font-sans` and the weight roles per
candidate. Without a selection the app keeps the system sans stack.

## Provenance

Each face is the variable TTF from a pinned `google/fonts` commit, converted to
woff2 by the command below. Each `*-OFL.txt` is the SIL Open Font License 1.1
copy from the same commit, line endings normalised to LF; keep it with its
font.

| File                                      | Family, version                  | Source                                                                                                                                                            | Weight axis |
| ----------------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `PublicSans-Variable.woff2`               | Public Sans 2.001                | [`google/fonts@8b0a1d0:ofl/publicsans`](https://github.com/google/fonts/tree/8b0a1d0f5983c89bc2b93f1b5fb55f9e252744b5/ofl/publicsans)                             | 100 to 900  |
| `IBMPlexSans-Variable.woff2`              | IBM Plex Sans 3.201              | [`google/fonts@0b58fb3:ofl/ibmplexsans`](https://github.com/google/fonts/tree/0b58fb370093f9a9f4ff785d94405710b79de67c/ofl/ibmplexsans)                           | 100 to 700  |
| `AtkinsonHyperlegibleNext-Variable.woff2` | Atkinson Hyperlegible Next 2.001 | [`google/fonts@95f4904:ofl/atkinsonhyperlegiblenext`](https://github.com/google/fonts/tree/95f4904fc8bcf26d3420fe315560c96417c6dec7/ofl/atkinsonhyperlegiblenext) | 200 to 800  |

## Matched to the system font

So the candidates can be compared on letter shapes alone, each is matched to
the system font (SF Pro, measured at 13px):

| Family                     | `size-adjust` in `fonts.ts` | Weight roles in `globals.css` |
| -------------------------- | --------------------------- | ----------------------------- |
| Public Sans                | 101.8%                      | 350 / 480 / 610               |
| IBM Plex Sans              | 102%                        | 410 / 480 / 560               |
| Atkinson Hyperlegible Next | 106.1%                      | 380 / 460 / 560               |

`size-adjust` equalises x-height. The weight roles are the weights whose
stroke matches the system font at 400 / 500 / 600; they need the variable
axis, so do not swap a face for static weights without retuning them.

## Coverage contract

Same rule as above: ship every glyph upstream has and do not subset by script.
`fonts.clienttest.ts` asserts it per family.

| Family                     | Codepoints | Missing scripts                  |
| -------------------------- | ---------- | -------------------------------- |
| Public Sans                | 565        | Cyrillic, Greek                  |
| IBM Plex Sans              | 891        | none of the ones the app samples |
| Atkinson Hyperlegible Next | 362        | Vietnamese, Cyrillic, Greek      |

Text in a missing script falls back to the system font.

## Regenerating

```sh
convert() { # <google/fonts commit> <family dir> <upstream ttf> <output>
  curl -sSL -o "$3" \
    "https://raw.githubusercontent.com/google/fonts/$1/ofl/$2/$(printf %s "$3" | sed 's/\[/%5B/; s/\]/%5D/; s/,/%2C/')"
  pyftsubset "$3" --unicodes='*' --layout-features='*' --flavor=woff2 \
    --output-file="$4"
}
convert 8b0a1d0f5983c89bc2b93f1b5fb55f9e252744b5 publicsans \
  'PublicSans[wght].ttf' PublicSans-Variable.woff2
convert 0b58fb370093f9a9f4ff785d94405710b79de67c ibmplexsans \
  'IBMPlexSans[wdth,wght].ttf' IBMPlexSans-Variable.woff2
convert 95f4904fc8bcf26d3420fe315560c96417c6dec7 atkinsonhyperlegiblenext \
  'AtkinsonHyperlegibleNext[wght].ttf' AtkinsonHyperlegibleNext-Variable.woff2
```

To take a newer upstream release, move the commit and update the family's
entry in `FAMILIES` in `fonts.clienttest.ts` and the tables above in the same
commit. Check the same things as for IBM Plex Mono, plus that the weight axis
still spans the roles.
