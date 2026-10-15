# Experiment filter sidebar

`ExperimentFilterSidebar` is a controlled editor over the table's canonical URL
`FilterState`. The host supplies target labels and target-scoped options; the
sidebar owns only visibility and unfinished edit buffers. Each condition is its
own block, including repeated scores or metadata keys. An Apply action changes
only that occurrence, and incomplete conditions never reach applied state.

`experimentFilterEditing` owns draft conversion, completeness validation and
condition-level replacement/removal. New conditions explicitly target `all`;
legacy conditions without a target display as `baseline`. Backend qualification
and experiment selection remain owned by the table host.

Apply/remove actions emit existing filtering analytics with counts, field types,
operators and target kind only. Filter content and experiment identities are not
included in telemetry; condition editor subtrees are blocked from session replay.
