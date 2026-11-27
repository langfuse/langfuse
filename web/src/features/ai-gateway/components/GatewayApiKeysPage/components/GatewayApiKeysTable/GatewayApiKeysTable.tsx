import { ListTree, Pencil, RotateCcw, Trash } from "@langfuse/icons";
import { formatDistanceToNowStrict } from "date-fns";

import { TableCard } from "@/src/components/TableCard/TableCard";
import type { PaginationBarProps } from "@/src/components/design-system/PaginationBar/PaginationBar";
import { createDateTableColumn } from "@/src/components/design-system/table/columns/createDateTableColumn";
import { createBadgeListTableColumn } from "@/src/components/design-system/table/columns/createBadgeListTableColumn";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";
import { createUserTableColumn } from "@/src/components/design-system/table/columns/createUserTableColumn";
import { createTableColumn } from "@/src/components/design-system/table/columns/utils/createTableColumn";
import { Skeleton } from "@/src/components/ui/skeleton";
import { buildLocalIsoDatePresentation } from "@/src/utils/dates";
import type {
  AsyncTableData,
  TableProps,
} from "@/src/components/design-system/table/Table";
import type { LangfuseColumnDef } from "@/src/components/table/types";
import { isApiKeyExpired } from "@/src/features/apiKey/helpers/isApiKeyExpired";
import { GATEWAY_API_KEY_LAST_USED_WINDOW_DAYS } from "@/src/features/ai-gateway/constants/gatewayApiKeyLastUsed";
import { GatewayApiKeysEmptyState } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/GatewayApiKeysTable/components/GatewayApiKeysEmptyState/GatewayApiKeysEmptyState";
import { GatewayDefaultBudgetTag } from "@/src/features/ai-gateway/components/GatewayDefaultBudgetTag/GatewayDefaultBudgetTag";
import { GatewaySpendBudgetBadge } from "@/src/features/ai-gateway/components/GatewaySpendBudgetBadge/GatewaySpendBudgetBadge";
import { GatewayApiKeyModelsCell } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/GatewayApiKeysTable/components/GatewayApiKeyModelsCell/GatewayApiKeyModelsCell";
import { buildGatewayTracesHref } from "@/src/features/ai-gateway/fns/gatewayUrls/buildGatewayTracesHref";
import { parseGatewayAllowedModels } from "@/src/features/ai-gateway/fns/parseGatewayAllowedModels";
import type { GatewaySpendLimit } from "@/src/features/ai-gateway/types/gatewaySpendLimit";

type GatewayApiKey = {
  metadata: unknown;
  allowedModels: unknown;
  spendLimit: GatewaySpendLimit | null;
  /** The organization's default key budget, which caps the key while it has no `spendLimit` of its own. */
  defaultSpendLimit?: GatewaySpendLimit | null;
  hasSeveralSpendLimits: boolean;
  apiKey: {
    id: string;
    publicKey: string;
    displaySecretKey: string;
    note: string | null;
    createdAt: Date;
    expiresAt: Date | null;
    user: {
      name: string | null;
      email: string | null;
      image: string | null;
    } | null;
  };
  /** Absent until the last-used query resolves, and when the key had no gateway traffic in the window. */
  lastUsedAt?: Date;
  /** Spend against `spendLimit`, or else `defaultSpendLimit`, in its current window; absent until the spend query resolves. */
  spentUsd?: number;
};

const lastUsedSkeleton = <Skeleton className="h-4 w-1/2" />;

/** `isTracked` is false when gateway traffic is not recorded (ingestion mode `NONE` or no active ingestion project). */
type GatewayApiKeysLastUsedState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "success"; isTracked: boolean };

type GatewayApiKeysSpendState = { status: "loading" | "error" | "success" };

const budgetSkeleton = <Skeleton className="h-5 w-16 shrink-0 rounded-sm" />;

export function GatewayApiKeysTable({
  data,
  lastUsed,
  spend,
  onEdit,
  onResetBudget,
  onRevoke,
  onCreateKey,
  ingestionProjectId,
  pagination,
  search,
  orderBy,
  setOrderBy,
}: Pick<TableProps<GatewayApiKey>, "orderBy" | "setOrderBy"> & {
  data: AsyncTableData<GatewayApiKey[]>;
  lastUsed: GatewayApiKeysLastUsedState;
  spend: GatewayApiKeysSpendState;
  onEdit: (apiKey: GatewayApiKey) => void;
  onResetBudget: (apiKey: GatewayApiKey) => void;
  onRevoke: (apiKeyId: string) => void;
  onCreateKey: () => void;
  /** Configured ingestion project the user can open; hides "Show traces" when absent. */
  ingestionProjectId?: string | null;
  pagination: PaginationBarProps;
  search: { value: string; onChange: (value: string) => void };
}) {
  const hasSearch = search.value.trim().length > 0;
  /** An out-of-range page is also empty; it keeps the table so its pagination can page back. */
  const hasNoKeys = !hasSearch && pagination.totalCount === 0;
  const columns: LangfuseColumnDef<GatewayApiKey>[] = [
    createDateTableColumn<GatewayApiKey>({
      accessorFn: (row) => row.apiKey.createdAt,
      id: "createdAt",
      header: "Created",
      enableResizing: false,
      enableSorting: true,
    }),
    createTextTableColumn<GatewayApiKey>({
      accessorFn: (row) => row.apiKey.note,
      id: "description",
      header: "Name",
      nullValue: "-",
      enableResizing: false,
      enableSorting: true,
    }),
    createTextTableColumn<GatewayApiKey>({
      accessorFn: (row) => row.apiKey.displaySecretKey,
      id: "key",
      header: "Key",
      sensitive: true,
      enableResizing: false,
    }),
    createUserTableColumn<GatewayApiKey>({
      accessorFn: (row) => row.apiKey.user,
      id: "user",
      header: "User",
      variant: "avatar",
      nullValue: "Service account",
      hideBelowMd: true,
      enableResizing: false,
    }),
    createDateTableColumn<GatewayApiKey>({
      accessorFn: (row) => row.apiKey.expiresAt,
      id: "expiresAt",
      header: "Expiration",
      hideBelowMd: true,
      enableResizing: false,
      enableSorting: true,
      emptyValue: "No expiration",
      getPrefix: (expiresAt) =>
        isApiKeyExpired(expiresAt) ? "Expired on " : null,
    }),
    createTableColumn<GatewayApiKey, GatewayApiKey["spendLimit"]>({
      accessorFn: (row) => row.spendLimit,
      id: "budget",
      header: "Budget",
      size: 200,
      hideBelowMd: true,
      enableResizing: false,
      loadingCell: budgetSkeleton,
      renderCell: (spendLimit, { row }) => {
        const applied = spendLimit ?? row.original.defaultSpendLimit;
        if (!applied) {
          return <span className="text-muted-foreground">No budget</span>;
        }
        if (spend.status === "loading") return budgetSkeleton;
        return (
          <span className="inline-flex items-center gap-2">
            <GatewaySpendBudgetBadge
              subject="key"
              spendLimit={applied}
              spentUsd={row.original.spentUsd}
            />
            {!spendLimit && <GatewayDefaultBudgetTag subject="key" />}
          </span>
        );
      },
    }),
    createTableColumn<GatewayApiKey, Date>({
      accessorFn: (row) => row.lastUsedAt,
      id: "lastUsedAt",
      header: "Last used",
      hideBelowMd: true,
      enableResizing: false,
      loadingCell: lastUsedSkeleton,
      renderCell: (lastUsedAt) => {
        if (lastUsed.status === "loading") return lastUsedSkeleton;
        if (!lastUsedAt) {
          return (
            <span className="text-muted-foreground">
              {lastUsed.status === "success" && lastUsed.isTracked
                ? `Not used (${GATEWAY_API_KEY_LAST_USED_WINDOW_DAYS}d)`
                : "Unavailable"}
            </span>
          );
        }
        return (
          <span
            className="block w-full truncate"
            title={buildLocalIsoDatePresentation({ date: lastUsedAt })?.title}
          >
            {formatDistanceToNowStrict(lastUsedAt, { addSuffix: true })}
          </span>
        );
      },
    }),
    createTableColumn<GatewayApiKey, string[]>({
      accessorFn: (row) => parseGatewayAllowedModels(row.allowedModels),
      id: "allowedModels",
      header: "Models",
      sensitive: true,
      hideBelowMd: true,
      enableResizing: false,
      loadingCell: <Skeleton className="h-5 w-16 shrink-0 rounded-sm" />,
      renderCell: (patterns) => (
        <GatewayApiKeyModelsCell patterns={patterns ?? null} />
      ),
    }),
    createBadgeListTableColumn<GatewayApiKey>({
      accessorFn: (row) => getMetadataEntries(row.metadata),
      id: "metadata",
      header: "Metadata",
      sensitive: true,
      enableResizing: false,
    }),
  ];

  const getRowActions = (row: GatewayApiKey) => [
    {
      id: "edit",
      type: "item" as const,
      title: "Edit key",
      icon: Pencil,
      onClick: () => onEdit(row),
    },
    {
      id: "resetBudget",
      type: "item" as const,
      title: "Reset budget",
      icon: RotateCcw,
      disabled:
        row.spendLimit || row.defaultSpendLimit
          ? undefined
          : { reason: "This key has no budget to reset." },
      onClick: () => onResetBudget(row),
    },
    ...(ingestionProjectId
      ? [
          {
            id: "showTraces",
            type: "item" as const,
            title: "Show traces",
            icon: ListTree,
            href: buildGatewayTracesHref({
              projectId: ingestionProjectId,
              subject: "key",
              subjectId: row.apiKey.id,
            }),
          },
        ]
      : []),
    {
      id: "revoke",
      type: "item" as const,
      title: "Revoke key",
      icon: Trash,
      variant: "destructive" as const,
      onClick: () => onRevoke(row.apiKey.id),
    },
  ];

  return (
    <TableCard
      tableName="gatewayApiKeys"
      columns={columns}
      data={data}
      orderBy={orderBy}
      setOrderBy={setOrderBy}
      actions={getRowActions}
      pagination={pagination}
      search={
        hasNoKeys
          ? undefined
          : { ...search, placeholder: "Search by name or user" }
      }
      noResultsMessage={
        hasSearch
          ? "No gateway keys match the current search."
          : "No gateway keys created."
      }
      emptyState={
        hasNoKeys ? (
          <GatewayApiKeysEmptyState onCreateKey={onCreateKey} />
        ) : undefined
      }
    />
  );
}

function getMetadataEntries(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value).flatMap(([key, item]) =>
    item === null ||
    typeof item === "string" ||
    typeof item === "number" ||
    typeof item === "boolean"
      ? [`${key}: ${String(item)}`]
      : [],
  );
}
