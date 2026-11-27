# Experiment filter sidebar

`ExperimentFilterSidebar` is a controlled editor over the table's canonical URL
`FilterState`. The host supplies target labels and combined score options for the selected experiments; the
sidebar owns only visibility and unfinished edit buffers. Each condition is its
own block, including repeated scores or metadata keys. An Apply action changes
only that occurrence, and incomplete conditions never reach applied state.
The container supplies table context and analytics to the prop-only
`ExperimentFilterSidebarView`. `ExperimentFilterBlock` and
`ExperimentFilterMetadataForm` own React Hook Form edit buffers; keyed mounts
reset them when applied conditions change. Interaction stories exercise the
view with real controls, without query/context mocks.

`ExperimentFilterCreationContent` owns the type picker;
`AvailableExperimentFilters` owns the inactive catalog. Add filter
opens a popover: choosing Status applies `DEFAULT`; scores apply the first
available name with numeric `>= 0`, boolean `true`, or the first categorical
value. Each choice displays its default before selection. Unavailable score
types are disabled until options contain a usable score. Metadata collects its
required key inside the popover and applies `is set`; cancelling discards that
buffer. New sidebar blocks are always already-applied conditions, never drafts.
Unchecking Show only active exposes an addable catalog using the same defaults.
Numeric defaults exclude names also observed as boolean or categorical, even
when those names appear in the numeric aggregates returned by the host.

`experimentFilterEditing` owns draft conversion, completeness validation and
condition-level replacement/removal. New conditions explicitly target `all`;
legacy conditions without a target use the host's `legacyDefaultTarget`
(baseline, or the first comparison when no baseline is selected). The client expands `all` into the current selection whenever it builds a request,
so removing or adding an experiment updates its scope. Each request group contains
ordinary filters and an experiment ID; the backend qualification logic is unchanged.

Apply/remove actions emit existing filtering analytics with counts, field types,
operators and target kind only. Filter content and experiment identities are not
included in telemetry; condition editor subtrees are blocked from session replay.
Creation uses the same apply event exactly once; opening or cancelling its picker
does not emit a filtering event. Portaled choices and metadata setup retain the
same replay boundary as the condition editors.

An options request failure displays the host's error and a Retry options action.
Score changes remain disabled until their options are available; failure is not
shown as permanent loading. Retry delegates to the host's existing query and
does not create a new analytics event.

Inline/mobile creation popovers use a feature-owned portal host inside the
Filters sheet's panel layer. This keeps the popup inside the modal's accessible
subtree; the global popover layer is hidden by the sheet. Desktop creation keeps
the default global layer. `PopoverController` forwards the optional container
without changing its default portal or modal behavior.
