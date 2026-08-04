# Input/Output style matrix — unified TraceSidePanel (round v1)

Branch `session-redesign`, verification only (no code changes). Dev server
:3000, light mode, viewport 1600x1000 (obs-only panel 480px wide, full panel
~1010px wide).

Matrix: {GENERATION, AGENT, SPAN, TOOL, EVENT} x {observation-only (session
inspector), full (Trace View `?observation=`)} x {Formatted, JSON (Beta off)}.
Extras: EVENT empty I/O, input-only-null, output-only-null, one JSON-Beta
reference shot. Styles were probed with `getComputedStyle` on the live DOM,
not just eyeballed.

## Cell index

| # | File | Type | Variant | View | Data shape |
|---|------|------|---------|------|-----------|
| 01 | 01-obsonly-agent-formatted.png | AGENT | obs-only | Formatted | string in/out (markdown) |
| 02 | 02-obsonly-agent-json.png | AGENT | obs-only | JSON | string in/out |
| 03 | 03-obsonly-span-formatted-null.png | SPAN | obs-only | Formatted | null in/out |
| 04 | 04-obsonly-span-json-null.png | SPAN | obs-only | JSON | null in/out |
| 05 | 05-obsonly-tool-formatted.png | TOOL | obs-only | Formatted | object in, string out |
| 06 | 06-obsonly-tool-json.png | TOOL | obs-only | JSON | object in, string out |
| 07 | 07-obsonly-generation-formatted.png | GENERATION | obs-only | Formatted | ChatML |
| 08 | 08-obsonly-generation-json.png | GENERATION | obs-only | JSON | ChatML |
| 09 | 09-obsonly-event-formatted-empty.png | EVENT | obs-only | Formatted | null in/out |
| 10 | 10-obsonly-event-json-empty.png | EVENT | obs-only | JSON | null in/out |
| 11-20 | 11..20-full-*.png | same five types | full | Formatted+JSON | same observations |
| 21 | 21-full-span-formatted-output-null-chatmode.png | SPAN (beeai) | full | Formatted | ChatML input, null output |
| 22 | 22-full-span-formatted-input-null.png | SPAN (beeai) | full | Formatted | null input, object output |
| 23 | 23-obsonly-agent-jsonbeta.png | AGENT | obs-only | JSON Beta | reference |

Observations used: `session-shapes-s42-agent-t0-o{0,1,2}` (AGENT/SPAN/TOOL),
`long-session-s42-t0-o1` (GENERATION), `long-session-s42-t1-o3` (EVENT),
beeai trace `096fc09a30ab90d2431778f9ee2b3936`.

## Style constants measured (identical wherever they appear)

- Section heading: 13.2px / 600 / capitalize, header padding 4px 8px
  (`MarkdownJsonViewHeader`, `.io-message-header`) — consistent everywhere.
- Box chrome when present: 1px `border` (rgb 226,232,240), `rounded-sm` (4px),
  Input `bg-card` (white), Output `bg-accent-light-green` (rgb 240,253,244),
  Metadata transparent — consistent wherever a box is drawn.
- Full vs observation-only: computed styles are byte-identical per cell (same
  presenter, both providers mounted). Only panel width/header layout differ.

## Findings (worst first)

| # | Verdict | What differs | Owner | Suggested fix (1 line) |
|---|---------|--------------|-------|------------------------|
| 1 | INCONSISTENT | Missing I/O placeholders disagree per field and per view: Formatted shows Input `null` but Output `undefined` for the same missing state (03/09/13/19); JSON view shows `undefined` for BOTH (04/10/14/20) — and `undefined` isn't JSON. Raw literals also read as data, not as an empty state. | `JsonInputOutputView` in `web/src/components/trace/components/IOPreview/IOPreviewPretty.tsx` (`json={parsedInput ?? null}` vs `json={parsedOutput}`); `IOPreviewJSONSimple.tsx` passes raw `undefined`; literals from `getEmptyValueDisplay` in `web/src/components/ui/PrettyJsonView.tsx` | Normalize both fields to `?? null` and render one shared empty-state ("No input/output captured", italic muted) in both views. |
| 2 | INCONSISTENT | Box chrome depends on content shape, mixing within one panel: object/table and empty content get the bordered rounded box, but string/markdown content renders a full-bleed borderless tint band (TOOL Formatted 05/15: bordered white Input table directly above borderless green Output band; AGENT Formatted 01/11: no boxes at all, invisible white Input "box"). JSON view always draws boxes. | `PrettyJsonView.tsx` — `getContainerClasses` adds `rounded-sm border` for table/empty branches, but the `isMarkdownMode` branch (~line 1501) wraps in `getBackgroundColorClass()` only; chat bubbles (`ChatMessage`/`ChatMessageList`) are also borderless | Give the markdown/chat branch the same rounded-border container (or remove borders from table/empty so Formatted is uniformly flat). |
| 3 | INCONSISTENT | Empty-output treatment depends on renderer branch: chat-parseable content with null output shows NO Output section at all (21), while non-chat content shows an `undefined` placeholder box (03/09). Same missing-output state, two treatments. | `IOPreviewPretty.tsx` `shouldRenderMessages` branch (ChatMessageList renders only messages; no output placeholder) | Render the shared empty-output state (from #1) after the message list when output is null, or hide the placeholder in both branches. |
| 4 | INCONSISTENT | Body text scale jumps between adjacent sections in Formatted: markdown prose renders at 16px sans (`MarkdownView`) while tables/JSON render ~11.2px (`text-xs`, mono-styled) — TOOL Formatted shows both on one screen (05/15); markdown also promotes `##` in LLM output to giant headings (07/17). | `MarkdownView` (prose scale) vs `MONO_TEXT_CLASSES`/`text-xs` containers in `PrettyJsonView.tsx` | Cap the markdown prose base at the panel's text scale (prose-sm / text-sm) inside the side panel. |
| 5 | INCONSISTENT (known/intentional per TraceSidePanel comment) | I/O zone contents differ between tabs: Formatted puts Metadata in the bottom accordion; JSON renders Metadata as a third inline box and the accordion disappears (02 vs 01, 04 vs 03, ...). | `TraceSidePanel.tsx` (accordion only when `currentView === "pretty"`); `IOPreviewJSONSimple.tsx` has no `showMetadata` prop and always renders metadata inline | Add `showMetadata` to `IOPreviewJSONSimple` and keep Metadata in the accordion for both views. |
| 6 | CONSISTENT (by design, note only) | GENERATION Formatted headings are role names ("User", "Assistant") instead of "Input"/"Output" (07/17); heading typography itself is identical. EVENT/SPAN placeholder boxes are shown instead of the old compact panel's hidden sections (NOTES.md known item — the `hideIfNull` flag exists but the panel doesn't pass it). | `ChatMessageList` vs `PrettyJsonView` titles; `TraceSidePanel.tsx` doesn't set `hideIfNull` | If empty sections should disappear again in the inspector, pass `hideIfNull` — but pair it with #1 so behavior matches the trace view. |
| 7 | CONSISTENT | Full vs observation-only variant: every probed cell identical (border, radius, bg, heading, padding, placeholder text). The consolidation goal holds. | `TraceSidePanel.tsx` (single presenter) | None. |
| 8 | Reference | JSON Beta is a different world by design (sectioned flat viewer, line numbers, no boxes) and reserves large fixed vertical dead space under short sections (23). | `IOPreviewJSON.tsx` / AdvancedJsonViewer | Out of scope here; the dead space may deserve its own look. |

## Verdict

Across variants the panel is consistent — the consolidation works. Across
observation types, styling is driven by data shape, not type, and the seams
live in the pretty/JSON renderers: the null-vs-undefined placeholder split
(worst, user-visible on every SPAN/EVENT without I/O), the bordered-vs-
borderless box chrome mix, and the chat branch silently dropping empty
outputs. All are pre-existing IOPreview behaviors the unified panel now
exposes on both surfaces; all have single-file owners and small fixes.
