import {
  TableViewPresetTableName,
  type FilterState,
  type OrderByState,
  type TableViewPresetState,
} from "@langfuse/shared";

export type TableViewCompatibilityMode = "default" | "events-v4";

export type TableViewNotice = {
  title: string;
  description: string;
  variant: "info" | "warning";
  canClear?: boolean;
};

type TableViewWithSource = TableViewPresetState & {
  tableName: TableViewPresetTableName;
};

type CompatibilityResolution =
  | {
      action: "apply";
      viewState: TableViewPresetState;
      notice: TableViewNotice | null;
    }
  | {
      action: "reject";
      notice: TableViewNotice;
    };

const EVENTS_V4_COLUMN_RENAMES: Record<string, string> = {
  model: "providedModelName",
  Model: "providedModelName",
  tags: "traceTags",
  tokens: "totalTokens",
  Tokens: "totalTokens",
};

const migrateColumnId = (
  column: string,
): { column: string; changed: boolean } => {
  const migratedColumn = EVENTS_V4_COLUMN_RENAMES[column];

  return {
    column: migratedColumn ?? column,
    changed: migratedColumn !== undefined,
  };
};

const migrateOrderBy = (
  orderBy: OrderByState | null | undefined,
): { orderBy: OrderByState | null | undefined; changed: boolean } => {
  if (!orderBy) {
    return { orderBy, changed: false };
  }

  const { column, changed } = migrateColumnId(orderBy.column);

  return {
    orderBy: {
      ...orderBy,
      column,
    },
    changed,
  };
};

const migrateFilters = (
  filters: FilterState | null | undefined,
): { filters: FilterState | null | undefined; changed: boolean } => {
  if (!filters) {
    return { filters, changed: false };
  }

  let changed = false;
  const migratedFilters = filters.map((filter) => {
    const migrated = migrateColumnId(filter.column);
    changed ||= migrated.changed;

    return {
      ...filter,
      column: migrated.column,
    };
  });

  return { filters: migratedFilters, changed };
};

const migrateColumnOrder = (
  columnOrder: string[] | null | undefined,
): { columnOrder: string[] | null | undefined; changed: boolean } => {
  if (!columnOrder) {
    return { columnOrder, changed: false };
  }

  let changed = false;
  const migratedColumnOrder = columnOrder.map((column) => {
    const migrated = migrateColumnId(column);
    changed ||= migrated.changed;
    return migrated.column;
  });

  return { columnOrder: migratedColumnOrder, changed };
};

const migrateColumnVisibility = (
  columnVisibility: Record<string, boolean> | null | undefined,
): {
  columnVisibility: Record<string, boolean> | null | undefined;
  changed: boolean;
} => {
  if (!columnVisibility) {
    return { columnVisibility, changed: false };
  }

  let changed = false;
  const migratedEntries = Object.entries(columnVisibility).map(
    ([column, isVisible]) => {
      const migrated = migrateColumnId(column);
      changed ||= migrated.changed;
      return [migrated.column, isVisible] as const;
    },
  );

  return {
    columnVisibility: Object.fromEntries(migratedEntries),
    changed,
  };
};

const migrateObservationsViewToEvents = (
  viewData: TableViewWithSource,
): { viewState: TableViewPresetState; changed: boolean } => {
  const { orderBy, changed: orderChanged } = migrateOrderBy(viewData.orderBy);
  const { filters, changed: filtersChanged } = migrateFilters(viewData.filters);
  const { columnOrder, changed: columnOrderChanged } = migrateColumnOrder(
    viewData.columnOrder,
  );
  const { columnVisibility, changed: columnVisibilityChanged } =
    migrateColumnVisibility(viewData.columnVisibility);

  return {
    viewState: {
      ...viewData,
      orderBy: orderBy ?? null,
      filters: filters ?? [],
      columnOrder: columnOrder ?? [],
      columnVisibility: columnVisibility ?? {},
    },
    changed:
      orderChanged ||
      filtersChanged ||
      columnOrderChanged ||
      columnVisibilityChanged,
  };
};

const getDefaultTableLabel = (tableName: TableViewPresetTableName): string => {
  switch (tableName) {
    case TableViewPresetTableName.Traces:
      return "Traces table";
    case TableViewPresetTableName.Observations:
      return "Observations table";
    case TableViewPresetTableName.Scores:
      return "Scores table";
    case TableViewPresetTableName.Sessions:
      return "Sessions table";
    case TableViewPresetTableName.SessionDetail:
      return "Session detail table";
    case TableViewPresetTableName.Datasets:
      return "Datasets table";
    default:
      return "table";
  }
};

const getTargetLabel = ({
  targetTableName,
  compatibilityMode,
}: {
  targetTableName: TableViewPresetTableName;
  compatibilityMode: TableViewCompatibilityMode;
}) => {
  if (
    compatibilityMode === "events-v4" &&
    targetTableName === TableViewPresetTableName.Observations
  ) {
    return "v4 Events view";
  }

  return getDefaultTableLabel(targetTableName);
};

const buildIncompatibleNotice = ({
  sourceLabel,
  targetLabel,
}: {
  sourceLabel: string;
  targetLabel: string;
}): TableViewNotice => ({
  title: `This saved view was created for the ${sourceLabel}.`,
  description: `It cannot be applied in the ${targetLabel}. Clear this view or recreate it from the current table.`,
  variant: "warning",
  canClear: true,
});

export const resolveTableViewCompatibility = ({
  viewData,
  targetTableName,
  compatibilityMode = "default",
}: {
  viewData: TableViewWithSource;
  targetTableName: TableViewPresetTableName;
  compatibilityMode?: TableViewCompatibilityMode;
}): CompatibilityResolution => {
  if (
    compatibilityMode === "events-v4" &&
    targetTableName === TableViewPresetTableName.Observations
  ) {
    if (viewData.tableName === TableViewPresetTableName.Traces) {
      return {
        action: "reject",
        notice: buildIncompatibleNotice({
          sourceLabel: "legacy Traces table",
          targetLabel: "v4 Events view",
        }),
      };
    }

    if (viewData.tableName === TableViewPresetTableName.Observations) {
      const migrated = migrateObservationsViewToEvents(viewData);

      return {
        action: "apply",
        viewState: migrated.viewState,
        notice: migrated.changed
          ? {
              title: "This saved view was migrated for the v4 Events view.",
              description:
                "Some legacy Observations columns were renamed. Review the migrated view and save it to upgrade it.",
              variant: "info",
            }
          : null,
      };
    }
  }

  if (viewData.tableName !== targetTableName) {
    return {
      action: "reject",
      notice: buildIncompatibleNotice({
        sourceLabel: getDefaultTableLabel(viewData.tableName),
        targetLabel: getTargetLabel({ targetTableName, compatibilityMode }),
      }),
    };
  }

  return {
    action: "apply",
    viewState: viewData,
    notice: null,
  };
};
