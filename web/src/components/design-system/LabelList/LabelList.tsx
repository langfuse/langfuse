import { cva } from "class-variance-authority";

import { BadgeShell } from "../Badge/Badge";
import { HoverCard } from "../HoverCard/HoverCard";
import { OverflowList } from "@/src/components/design-system/OverflowList/OverflowList";

const labelListVariants = cva("ph-no-capture", {
  variants: {
    layout: {
      contained: "flex gap-1",
      /** Labels flow as direct children of the host's flex-wrap row. */
      inline: "contents",
    },
    wrap: {
      true: "flex-wrap",
      false: "relative min-w-0 flex-nowrap items-center",
    },
  },
  defaultVariants: {
    layout: "contained",
    wrap: true,
  },
});

const DEFAULT_MAX_VISIBLE = 5;

export function LabelList(props: LabelListProps) {
  const { labels, layout = "contained" } = props;
  const isSingleLine = layout === "contained" && props.shouldWrap === false;
  const renderChip = (label: LabelListItem) => (
    <LabelChip
      key={label.name}
      name={label.name}
      isProduction={label.isProduction ?? false}
    />
  );
  if (!isSingleLine) {
    const visibleLabels = labels.slice(
      0,
      props.maxVisible ?? DEFAULT_MAX_VISIBLE,
    );
    return (
      <div className={labelListVariants({ layout, wrap: true })}>
        {visibleLabels.map(renderChip)}
        {labels.length > visibleLabels.length && (
          <LabelOverflow
            labels={labels}
            totalCount={labels.length}
            hiddenCount={labels.length - visibleLabels.length}
          />
        )}
      </div>
    );
  }

  return (
    <div className="ph-no-capture min-w-0">
      <OverflowList
        additionalOverflowCount={0}
        spacing="tight"
        minVisible={1}
        items={labels}
        getKey={(label) => label.name}
        renderItem={(label, { getItemProps }) => (
          <span {...getItemProps()}>{renderChip(label)}</span>
        )}
        renderOverflow={({ overflowItemCount }) => (
          <LabelOverflow
            labels={labels}
            totalCount={labels.length}
            hiddenCount={overflowItemCount}
          />
        )}
      />
    </div>
  );
}

export type LabelListItem = {
  name: string;
  /** Shows the production marker. */
  isProduction?: boolean;
};

type LabelListProps = {
  /** Rendered in the given order. */
  labels: LabelListItem[];
} & (
  | {
      layout?: "contained";
      shouldWrap?: true;
      /** Labels beyond this count collapse into a `+N` hover card. */
      maxVisible?: number;
    }
  | {
      layout?: "contained";
      /** One line: as many labels as fit, the rest collapse into `+N`. */
      shouldWrap: false;
      maxVisible?: never;
    }
  | {
      layout: "inline";
      shouldWrap?: never;
      maxVisible?: number;
    }
);

function LabelOverflow({
  labels,
  totalCount,
  hiddenCount,
}: {
  labels: readonly LabelListItem[];
  totalCount: number;
  hiddenCount: number;
}) {
  return (
    <HoverCard
      placement="bottom-start"
      content={
        <div className="ph-no-capture w-80 p-3">
          <div className="space-y-2">
            <h4 className="text-sm font-bold">All Labels</h4>
            <div className="flex flex-wrap gap-1">
              {labels.map((label) => (
                <LabelChip
                  key={label.name}
                  name={label.name}
                  isProduction={label.isProduction ?? false}
                />
              ))}
            </div>
          </div>
        </div>
      }
    >
      {({ getTriggerProps }) => (
        <BadgeShell asChild color="filled" size="md">
          <button
            type="button"
            className="text-muted-foreground cursor-pointer self-center"
            aria-label={`Show all ${totalCount} labels`}
            {...getTriggerProps()}
          >
            +{hiddenCount}
          </button>
        </BadgeShell>
      )}
    </HoverCard>
  );
}

function LabelChip({
  name,
  isProduction,
}: {
  name: string;
  isProduction: boolean;
}) {
  return (
    <BadgeShell color="filled" size="md">
      {isProduction && (
        <span className="bg-dark-green size-1.5 shrink-0 rounded-full" />
      )}
      <span className="truncate py-0.5" title={name}>
        {name}
      </span>
    </BadgeShell>
  );
}
