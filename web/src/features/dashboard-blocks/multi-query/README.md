# Multi-query dashboard charts

`MultiQueryEditor` owns an editable definition and automatically previews valid ordinary queries. `MultiQueryChart` is the dashboard renderer; both use `useMultiQueryWidget` and the same result view.

`multiQueryModel` validates and builds at most five independent production queries, preserves filter/version semantics, and normalizes exact returned values. A count metric distinguishes empty averages from measured zero. `useMultiQueryResults` gives each source a fixed scheduler slot, production cache policy and existing streaming/cancellation transport.

Saved views choose subsets of the configured sources. Compatible units share charts; different units have separate labeled panels. Data keeps raw values and source identities. No formulas or alternative query backend are used.

A single plot has a definite 16rem height. An editor can set `--multi-query-plot-height` on its preview container to provide a larger viewport; faceted unit panels keep their compact height and scroll in small cards.
