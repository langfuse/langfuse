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

## Where we are / where we're going

- **Now:** the visualiser is a set of recharts components behind one `Chart`
  dispatcher. The first preparer seam — the **time axis** — is in place
  (`prepareTimeAxis`): raw timestamps in, granularity-adaptive labels out, one
  formatter for every chart.
- **Next:** move the remaining decisions — series colors, legend summaries,
  top‑N/overload, units, axis type & scale — out of the components and into the
  preparer, until the visualiser is purely presentational and the preparer is
  the single, tested place where "what should this look like" is answered.

The target: adding a new chart should mean teaching the **preparer** a new shape,
not teaching every component a new special case.
