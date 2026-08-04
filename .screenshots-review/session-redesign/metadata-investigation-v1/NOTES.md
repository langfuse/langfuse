# metadata-investigation-v1

Round for the "why is metadata missing on some observations?" question, plus the
two fixes that came out of it. All shots are the observation-details panel
(TraceSidePanel), demo project, light mode.

Root cause recap: the metadata was never removed — the METADATA accordion was
collapsed by default (shared `MetadataAccordion`, `useState(false)`), so it read
as missing. One real gap found on top: the session path caps large metadata
values (>300K chars per value; past the 2M per-trace budget it ships `{}` +
`metadataTruncated`), and the "open Trace View for full metadata" hint that
`SessionObservationIO` shows in the conversation feed had NOT been carried into
the consolidated side panel.

Data: `md-trunc-session` (new `long-session --metadata-bytes 400000` seeder
flag; root `session-turn` observation carries a 388,920-char metadata value →
`metadataTruncated`), and `session-shapes-s42-chat` for the normal case.

## Before

- `01-before-accordion-collapsed.png` — md-trunc-t0-o0 (session-turn): METADATA
  accordion collapsed to "3 items"; nothing hints that metadata exists beyond
  the count. This is the "metadata looks removed" report.
- `02-before-truncated-metadata-no-hint.png` — same observation, accordion
  manually opened: the `bulk` value is the capped 4K head ("...") with NO hint
  that it is truncated or where the full value lives.

## After

- `03-after-accordion-open-with-hint.png` — accordion open by default, item
  count stays visible in the header, truncation hint at the bottom.
- `04-after-truncated-metadata-hint.png` — scrolled to the hint: "Some metadata
  values are too large to show here. Open Trace View for full metadata."
  (same copy + PostHog event as the conversation feed's hint; the link opens
  the trace peek at this observation — verified by click).
- `05-after-normal-observation-open-accordion.png` — session-shapes-s42-chat
  generation (observation-only variant): accordion open by default, no hint
  (metadata not truncated).
- `06-after-trace-view-full-variant-open-accordion.png` — trace page (full
  variant), same md-trunc observation: accordion open by default with the FULL
  metadata value (trace path has no session cap), no hint.

## Height cap (Trang's follow-up on the open-by-default accordion)

Shots 03/04 above double as the BEFORE for this change: with the accordion
open by default, a long metadata value made the open body arbitrarily tall.

- `07-after-metadata-height-capped-show-more.png` — same md-trunc observation:
  the open metadata body is capped at ~200px (the inspector's 10-line output
  cap) with the centered hairline "Show more ⌄" control (LineCappedText
  styling). The control renders only when the content actually overflows
  (measured via ResizeObserver; small metadata like shot 05's gets no
  control). The truncated-metadata hint moved to an accordion `footer` slot so
  it stays visible below the cap. The whole panel now fits one viewport.
- `08-after-metadata-expanded-show-less.png` — after "Show more": full content
  with the JSON viewer's own interactions intact (its "...expand (2000 more
  characters)" link still works) and a "Show less ⌃" control at the bottom;
  the hint stays put.

No hidden-line count on the control: the body is a PrettyJsonView table with
non-uniform row heights, so any "N more lines" number would be fabricated.

Note: Input/Output showing literal `undefined` in 01/03/04/06/07 is the
reverted finding #1 behavior (kept per "just keep null and undefined etc for
now").
