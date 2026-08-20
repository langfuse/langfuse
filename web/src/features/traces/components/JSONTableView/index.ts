/**
 * JSONTableView - Generic virtualized table with customizable columns.
 *
 * @example
 * ```tsx
 * <JSONTableView
 *   items={data}
 *   getItemKey={(item) => item.id}
 *   columns={[
 *     { key: "name", header: "Name", width: "flex-1", render: (item) => item.name },
 *     { key: "value", header: "Value", width: "w-20", align: "right", render: (item) => item.value },
 *   ]}
 *   expandable
 *   renderExpanded={(item) => <ExpandedContent item={item} />}
 *   virtualized={data.length > 100}
 * />
 * ```
 */

export { JSONTableView } from "./JSONTableView";
export { JSONTableViewHeader } from "./JSONTableViewHeader";
export { JSONTableViewRow } from "./JSONTableViewRow";
export type {
  JSONTableViewProps,
  JSONTableViewColumn,
  JSONTableViewRowProps,
  JSONTableViewHeaderProps,
} from "./json-table-view-types";
