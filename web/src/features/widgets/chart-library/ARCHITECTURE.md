# Charts & Dashboards — Architecture Manifesto

> A short, opinionated statement of how charting works here and where it's going.
> Read this before adding a chart type, a formatter, or a dashboard.

## The goal

**Show _any_ data clearly.** Unknown shape, any time range or scale, one series or
two hundred, clean or noisy, sparse or overloaded — a chart should render it
legibly and consistently, and let a person _read_ it through interaction. We do
not special-case per chart. We build one adaptable pipeline and feed everything
through it.

## The one rule: one-way flow, two layers

```
   data  ──▶  PREPARE  ──▶  VISUALISE  ──▶  pixels
            (decide)        (render)
```

- **Prepare** owns every _decision_: parsing, units, date/number/duration
  formatting, colors, series order, legend summaries, top‑N, axis type, scale,
  null handling. Pure functions. No React. Unit-tested.
- **Visualise** owns _only rendering_: it maps a presentation-ready model onto
  the chart library and decides nothing. If a component is reaching back to
  reformat or re-derive, the decision is in the wrong layer.

Strictly one direction. The visualiser never re-decides what the preparer
resolved. (When the same value got formatted in three places, we got three
different — and sometimes wrong — dates. One source of truth per decision.)

## Principles — the "show whatever data" doctrine

1. **One normalized model is the pivot.** Every source lowers into a single
   typed, presentation-agnostic shape _once_, up front. Everything downstream
   targets that shape and never knows where the data came from.

2. **Decide presentation once, upstream.** Units, decimals, thresholds, colors,
   labels, and time format are resolved in the preparer into ready-to-render
   values. The renderer reads derived properties; it never re-derives them.

3. **Infer what the data didn't declare.** Assume input is under-specified and
   messy. Have a default for every missing piece — type from values, the time
   field, the bucket granularity (from spacing), series names from labels.

4. **Adapt to scale reactively, not predictively.** Don't compute "nice" ticks
   yourself — let the scale place them and _format the spacing you're given_.
   Pick number/date/duration formats by magnitude and granularity. Size axes by
   measuring labels, not guessing.

5. **Messy and overloaded is a first-class, _bounded_ case.** Bound cost at the
   source (≈ one point per pixel), not in the renderer. Cap unbounded series
   with an explicit, reversible limit (+ an "others" rollup where it's
   meaningful); never silently truncate without saying so.

6. **Null means something — say which.** Distinguish "no data here" (a gap)
   from "connect across" from "zero". Make the choice explicit; most
   "messy data looks wrong" bugs live in implicit null handling.

7. **Group by meaning, not position.** Series that share a unit share an axis;
   mismatched units earn a second axis — automatically, by derived key, so the
   layout adapts to an unknown number of series.

8. **Fail into guidance, not a blank box.** When data can't be drawn, detect
   _why_ (missing time field? no numeric field? empty?) and offer the next
   action.

9. **Interaction is readability.** Dense data is made legible by hovering,
   focusing, and a crosshair synced across a shared timeline — not only by
   throwing data away. Precise-on-hover beats sparse-by-default.

10. **Split "how to draw" from "what to draw."** Rebuild render config only when
    the structure changes; a new data tick should just swap arrays. Stable,
    memoized inputs; the heavy reconciliation happens rarely.

## Visual & interaction direction

> The architectural rules above say _where_ a decision lives. These say _what_ to
> decide when you draw. One stance underlies all of them: **the data carries the
> visual weight; the frame stays quiet.** Chrome — grid, axes, labels — is pushed
> to low contrast so series shape and color are what the eye lands on. High
> data-ink, always.

- **V1 — Draw what was measured; don't invent shape between points.** Straight
  segments by default. A smooth/spline curve _implies values that were never
  sampled_ — treat it as an explicit opt-in, not a prettifier. Use stepped lines
  only for hold-until-change (state/counter) data.

- **V2 — Missing is a gap, not a zero.** A null breaks the line. Bridge a gap
  only when the series semantically continues across it; never substitute `0` to
  "fill" a hole — that invents a measurement. Break the line when a gap exceeds
  the expected sampling cadence. Zero-fill is permitted only where stacking math
  needs a number. (This is principle 6, made visual.)

- **V3 — Encode certainty with one consistent grammar.** Less-trustworthy data —
  a still-aggregating final bucket, a comparison/previous period — renders
  _dotted and paled_, never dropped and never identical to confirmed data. One
  treatment, so a reader learns it once.

- **V4 — Hover reads a vertical slice, snapped to real samples.** The crosshair
  tracks the cursor, but the readout snaps to the nearest actual point — never a
  fabricated value at an arbitrary x. Near a gap the snap tolerance tightens so a
  tooltip never floats over emptiness.

- **V5 — Crosshair is shared across the timeline; the tooltip is the hovered
  chart's alone.** Charts on one time range share a single vertical time-marker;
  only the chart under the cursor opens a tooltip, listing every series at that
  instant, sorted by value, the focused one emphasized. Emphasis lives in the
  tooltip and the legend — the canvas stays calm. Dimming series _on the canvas_
  is reserved for one deliberate gesture (vertical proximity to a line) and must
  be flicker-free, never a side effect of ordinary hover.

- **V6 — Color is identity, assigned once.** A series' color is derived from the
  series and read back by the legend, so swatch and line can never diverge, and
  the same entity keeps its color across every chart. The palette is bounded; a
  colorblind-safe option exists.

- **V7 — Formatting is type-driven and adaptive — trust the scale.** Numbers,
  durations, bytes, percentages, currency, and dates each format by their kind
  and by the magnitude/granularity the scale chose; one common unit per axis.
  Tick precision follows the scale (don't truncate a narrow range); tooltip
  precision is capped for reading; digits are tabular so they don't jitter.

- **V8 — Bound the frame, not the data.** Cap drawn series at a legible top-N
  with an honest "N of M" (and an "others" rollup where it sums); bound the
  legend (scroll / "+N more"); bound density upstream (≈ one point per pixel).
  Never reach legibility by silently dropping data in the renderer.

## Where we are / where we're going

- **Now:** the visualiser is a set of recharts components behind one `Chart`
  dispatcher. Three preparer seams are in place: the **time axis**
  (`prepareTimeAxis` — raw timestamps in, granularity-adaptive labels out, one
  formatter for every chart), the **series cap** (`prepareVisibleSeries` —
  ranks a breakdown by magnitude and keeps the top‑N so a high-cardinality
  group-by of hundreds of series stays both legible and fast, with an honest
  "top N of M" note rather than a silent truncation; see principle 5), and
  **missing-cell semantics** (`prepareDenseSeries` — makes every
  (bucket, series) cell explicit: a real `0` for additive metrics, `null` — a
  visible gap — for non-additive ones, with `connectNulls` off by default so a
  line never draws across a no-data bucket; V2 made real, LFE-10694).
  The interaction direction (V4/V5) is largely in place: a synced vertical
  crosshair, a tooltip that opens only on the hovered chart, and a vertical
  proximity highlight.
- **Known visual debts** (drawn but not yet matching the direction above):
  series color is assigned by index and cycles every 8 rather than being a
  stable identity (V6) — a visualiser default to migrate into the preparer.
  (V1's smooth-by-default debt is paid: lines and areas draw straight
  (`type="linear"`) since LFE-10694.)
- **Next:** move the remaining decisions — series colors (V6), curve/interpolation
  opt-ins (V1), legend summaries, units, axis type & scale — out of the components and
  into the preparer, until the visualiser is purely presentational and the
  preparer is the single, tested place where "what should this look like" is
  answered.

The target: adding a new chart should mean teaching the **preparer** a new shape,
not teaching every component a new special case.
