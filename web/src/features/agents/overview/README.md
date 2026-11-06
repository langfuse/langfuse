# Agents overview

`useAgentsOverview` owns the closed date/environment scope, discovery search and one bounded session projection. Cards, the list, activity and relationships read that same projection. URL state owns navigation, zoom and filters; the per-project prototype store supplies browser-local defaults only when a URL option is absent.

`prepareOverview` owns sorting, metric semantics, activity buckets, session geometry and settled-cohort chart preparation. `prepareRelationships` keeps observed calls, executed-tool overlap and declared capabilities separate. Renderers draw prepared data and send explicit user actions back to the controller.

Appearance lives in `../appearance`, keyed by project plus exact agent name. Glyphs and colors are browser-local preferences, not backend identity. Portaled previews and pickers own their `ph-no-capture` boundaries.

Coverage travels with the projection. Discovery and activity windows differ; dormant means no activity in the selected window within the discovery lookback. Real sessions and missing-session trace fallbacks remain distinct. Rankings describe loaded agents, and missing truncated buckets are unknown rather than zero. Native skill references and legacy tool-name previews retain their provenance.

Future server aggregates should replace projection preparation behind the same DTO, preserving explicit windows, completeness and attribution. Neither UI similarity nor declared tool availability establishes a causal call.
