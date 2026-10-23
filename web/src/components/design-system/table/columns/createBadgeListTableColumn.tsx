import { type CellContext, type RowData } from "@tanstack/react-table";
import { type IconComponent } from "@langfuse/icons";

import { Badge } from "@/src/components/design-system/Badge/Badge";
import { CustomTooltip } from "@/src/components/design-system/CustomTooltip/CustomTooltip";
// eslint-disable-next-line boundaries/dependencies
import { SingleLineOverflowList } from "@/src/components/SingleLineOverflowList";
import { EmptyValue } from "@/src/components/design-system/table/components/EmptyValue/EmptyValue";
// eslint-disable-next-line boundaries/dependencies
import { Skeleton } from "@/src/components/ui/skeleton";
import { cn } from "@/src/utils/tailwind";
import {
  createTableColumn,
  type TableColumnOptions,
} from "./utils/createTableColumn";
import {
  badgeVariantToColor,
  type BadgeVariant,
} from "./utils/badgeVariantColor";

type SemanticBadgeVariant = Extract<
  BadgeVariant,
  "destructive" | "error" | "success" | "warning"
>;
type DecorativeBadgeVariant = Extract<
  BadgeVariant,
  | "blue"
  | "violet"
  | "teal"
  | "emerald"
  | "purple"
  | "pink"
  | "orange"
  | "amber"
  | "green"
>;
type NeutralBadgeVariant = Extract<
  BadgeVariant,
  "default" | "secondary" | "tertiary"
>;

/** One chip treatment, shared by the item chips and the overflow chip. */
type Chip = {
  value: string;
  variant: BadgeVariant;
  icon?: IconComponent;
  ariaLabel?: string;
  title?: string;
};

type GetBadge<TData extends RowData, TItem, TVariant extends BadgeVariant> = (
  value: TItem,
  context: CellContext<TData, TItem[] | null | undefined>,
) => {
  value: string;
  variant: TVariant;
  icon?: IconComponent;
  ariaLabel?: string;
} & ([TItem] extends [string] ? { key?: string } : { key: string });

type BadgeListTableColumnOptions<
  TData extends RowData,
  TItem,
> = TableColumnOptions<TData, TItem[]> &
  (
    | {
        range: "decorative";
        getBadge: GetBadge<TData, TItem, DecorativeBadgeVariant>;
      }
    | ({
        range?: "neutral";
      } & ([TItem] extends [string]
        ? { getBadge?: GetBadge<TData, TItem, NeutralBadgeVariant> }
        : { getBadge: GetBadge<TData, TItem, NeutralBadgeVariant> }))
    | {
        range: "semantic";
        getBadge: GetBadge<TData, TItem, SemanticBadgeVariant>;
      }
  );

export function createBadgeListTableColumn<
  TData extends RowData,
  TItem = string,
>({ getBadge, range, ...options }: BadgeListTableColumnOptions<TData, TItem>) {
  return createTableColumn<TData, TItem[]>({
    ...options,
    loadingCell: <Skeleton className="h-5 w-16 shrink-0 rounded-sm" />,
    renderCell: (values, context) => {
      if (!values?.length) return <EmptyValue />;

      const badges = values.map((value, index) => {
        const badge =
          range === "semantic" || range === "decorative"
            ? getBadge(value, context)
            : (getBadge?.(value, context) ?? {
                value: String(value),
                variant: "secondary" as const,
                icon: undefined,
                ariaLabel: undefined,
              });

        // An item label can be clipped by truncation, so it also travels in a
        // native tooltip.
        return { key: String(index), title: badge.value, ...badge };
      });
      // The overflow chip stands in for chips of this same row, so both go
      // through one treatment rather than two Badge configurations.
      const renderBadge = ({
        value,
        variant,
        icon,
        ariaLabel,
        title,
      }: Chip) => (
        <Badge
          color={badgeVariantToColor(variant)}
          size="md"
          text={value}
          leadingIcon={icon}
          title={title}
          aria-label={ariaLabel}
        />
      );

      return (
        <SingleLineOverflowList
          items={badges}
          additionalOverflowCount={0}
          getKey={(badge) => badge.key}
          renderItem={renderBadge}
          renderOverflow={({ hiddenItems, overflowItemCount }) => (
            <CustomTooltip
              content={
                <div
                  className={cn(
                    "flex flex-wrap gap-1",
                    options.sensitive && "ph-no-capture",
                  )}
                >
                  {hiddenItems.map((badge) => (
                    <span key={badge.key}>{renderBadge(badge)}</span>
                  ))}
                </div>
              }
            >
              {({ getTriggerProps }) => (
                <span
                  {...getTriggerProps()}
                  className="inline-flex"
                  tabIndex={0}
                >
                  {renderBadge({
                    value: `+${overflowItemCount}`,
                    variant: "secondary",
                  })}
                </span>
              )}
            </CustomTooltip>
          )}
        />
      );
    },
  });
}
