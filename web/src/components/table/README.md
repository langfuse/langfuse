# Data table rendering

`data-table.tsx` owns the TanStack table, headers and body snapshot. The body
renders loading/empty states and creates one local row-height preview store per
mount. `TableDataRow` subscribes only to its compact/expanded mode; selection
subscriptions stay in `TableRowComponent` and the selection store.

Row resizing is a DOM integration owned by the body. Pointer and keyboard
movement update only the target row's frame heights and the slider's announced
value. Pixel movement does not render the body or cell content. Crossing Medium
updates only the target row's mode. Release commits one shared height through the
caller's persisted setting and restores the dragged row's scroll anchor.

`data-table-row-height-switch.tsx` owns presets, persisted custom heights, bounds
and the compact/expanded rendering contract. Its context supplies that semantic
mode to IO/tag cells; it does not publish continuous pixels.

Columns use design-system factories, with production IO/media bindings supplied
by `ConnectedIOTableCell`. The body memo compares explicit table snapshots because
TanStack's table instance is mutable.
