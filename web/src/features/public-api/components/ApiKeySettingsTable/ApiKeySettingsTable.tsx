import { useCallback, useMemo } from "react";
import { Pencil, SquareArrowOutUpRight, Trash } from "@langfuse/icons";

import { type SystemRole } from "@langfuse/shared/src/db";

import { type TableProps } from "@/src/components/design-system/table/Table";
import { createTableColumn } from "@/src/components/design-system/table/columns/utils/createTableColumn";
import { createDateTableColumn } from "@/src/components/design-system/table/columns/createDateTableColumn";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";
import { createUserTableColumn } from "@/src/components/design-system/table/columns/createUserTableColumn";
import {
  SettingsTable,
  type SettingsTableProps,
} from "@/src/components/SettingsTable/SettingsTable";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { Skeleton } from "@/src/components/ui/skeleton";
import { isApiKeyExpired } from "@/src/features/apiKey/helpers/isApiKeyExpired";
import {
  apiKeyPermissionSetDisplay,
  apiKeyResourceKinds,
} from "@/src/features/public-api/fns/apiKeyRoleDisplay";
import { rolePermissionCountLabel } from "@/src/features/rbac/components/RolePermissionList";
import { type RoleDisplay } from "@/src/features/rbac/components/roleDisplay";
import { type RouterOutput } from "@/src/utils/types";

const EXCLUDE_GATEWAY_KEYS = "exclude-gateway";
const ALL_KEYS = "all";

const GATEWAY_KEY_FILTER_OPTIONS = [
  { value: EXCLUDE_GATEWAY_KEYS, label: "Exclude gateway keys" },
  { value: ALL_KEYS, label: "All API keys" },
];

export type ApiKeySettingsTableRow =
  | RouterOutput["projectApiKeys"]["byProjectId"][number]
  | RouterOutput["organizationApiKeys"]["byOrganizationId"][number];

export function ApiKeySettingsTable({
  editNameAction,
  permissionsAction,
  hasWriteAccess,
  onDelete,
  search,
  gatewayKeyFilter,
  ...tableProps
}: ApiKeySettingsTableProps) {
  const columns = useMemo<LangfuseColumnDef<ApiKeySettingsTableRow>[]>(
    () => [
      createTextTableColumn<ApiKeySettingsTableRow>({
        id: "note",
        accessorFn: (apiKey) => apiKey.note || null,
        header: "Name",
        enableResizing: false,
        nullValue: "—",
        trailingAction: editNameAction.hasAccess
          ? {
              type: "custom",
              icon: Pencil,
              label: "Edit name",
              onClick: ({ row }) => editNameAction.onClick(row.original),
            }
          : undefined,
      }),
      ...(permissionsAction
        ? [createPermissionsColumn(permissionsAction)]
        : []),
      createUserTableColumn<ApiKeySettingsTableRow>({
        accessorKey: "createdByUser",
        header: "Created By",
        variant: "avatar",
        nullValue: "—",
        hideBelowMd: true,
        enableResizing: false,
        getUser: (user, { row }) => {
          if (user?.name || user?.email) return { type: "user", user };
          if (user) {
            return {
              type: "user",
              user: { name: "Unknown user", image: user.image },
            };
          }
          if (row.original.createdByApiKey) {
            return {
              type: "user",
              user: { name: row.original.createdByApiKey.publicKey },
            };
          }
          return undefined;
        },
      }),
      createTextTableColumn<ApiKeySettingsTableRow>({
        accessorKey: "publicKey",
        header: "Public Key",
        trailingAction: { type: "copy-to-clipboard" },
        enableResizing: false,
      }),
      createTextTableColumn<ApiKeySettingsTableRow>({
        accessorKey: "displaySecretKey",
        header: "Secret Key",
        enableResizing: false,
      }),
      createDateTableColumn<ApiKeySettingsTableRow>({
        accessorKey: "expiresAt",
        header: "Expiration",
        hideBelowMd: true,
        enableResizing: false,
        emptyValue: "No expiration",
        getPrefix: (expiresAt) =>
          isApiKeyExpired(expiresAt) ? "Expired on " : null,
      }),
      createDateTableColumn<ApiKeySettingsTableRow>({
        accessorKey: "createdAt",
        header: "Created",
        hideBelowMd: true,
        enableResizing: false,
      }),
    ],
    [editNameAction, permissionsAction],
  );

  const actions = useCallback<
    NonNullable<TableProps<ApiKeySettingsTableRow>["actions"]>
  >(
    (apiKey) => [
      {
        id: "delete",
        type: "item",
        title: "Delete API key",
        icon: Trash,
        variant: "destructive",
        disabled: hasWriteAccess
          ? undefined
          : { reason: "You do not have permission to delete this API key" },
        onClick: () => onDelete(apiKey),
      },
    ],
    [hasWriteAccess, onDelete],
  );

  return (
    <SettingsTable
      tableName="API keys"
      columnOrderKey="apiKeysColumnOrder-v2"
      columns={columns}
      actions={actions}
      search={{ ...search, placeholder: "Search by name" }}
      filters={
        gatewayKeyFilter
          ? [toGatewayKeySettingsFilter(gatewayKeyFilter)]
          : undefined
      }
      {...tableProps}
    />
  );
}

/** PermissionsCell shows a key's permission set and opens its permissions on click. */
function PermissionsCell({
  role,
  permissionsAction,
}: {
  role: SystemRole;
  permissionsAction: PermissionsAction;
}) {
  const permissionSet = apiKeyPermissionSetDisplay(
    role,
    permissionsAction.scope,
  );
  const countLabel = rolePermissionCountLabel(
    role,
    apiKeyResourceKinds(permissionsAction.scope),
  );

  return (
    <button
      type="button"
      onClick={() => permissionsAction.onClick(role)}
      aria-label={`View ${permissionSet?.name ?? countLabel}`}
      className="group/permissions focus-visible:ring-ring flex min-w-0 items-center gap-2 rounded-sm text-left outline-none focus-visible:ring-2"
    >
      <span className="flex min-w-0 flex-col items-start gap-0.5 leading-tight">
        {permissionSet && <PermissionSetLabel permissionSet={permissionSet} />}
        <span
          className="text-muted-foreground max-w-full truncate text-[0.625rem] leading-tight"
          title={countLabel}
        >
          {countLabel}
        </span>
      </span>
      <SquareArrowOutUpRight
        size="sm"
        color="muted"
        __rawClassName="shrink-0 opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-visible/permissions:opacity-100"
      />
    </button>
  );
}

/** PermissionSetLabel shows a named permission set's icon and name. */
function PermissionSetLabel({ permissionSet }: { permissionSet: RoleDisplay }) {
  const { Icon, name } = permissionSet;

  return (
    <span className="flex max-w-full min-w-0 items-center gap-1.5">
      <Icon size="sm" __rawClassName="shrink-0" />
      <span className="truncate" title={name}>
        {name}
      </span>
    </span>
  );
}

/** createPermissionsColumn renders each key's permission set; rows without a role stay empty. */
function createPermissionsColumn(permissionsAction: PermissionsAction) {
  return createTableColumn<ApiKeySettingsTableRow, SystemRole>({
    id: "role",
    accessorFn: (apiKey) => apiKeyRole(apiKey),
    header: "Permissions",
    enableResizing: false,
    loadingCell: <Skeleton className="h-4 w-1/2" />,
    renderCell: (role) => renderPermissionsCell(role, permissionsAction),
  });
}

/** renderPermissionsCell renders the permissions cell for a role, if any. */
function renderPermissionsCell(
  role: SystemRole | null | undefined,
  permissionsAction: PermissionsAction,
) {
  if (!role) return null;
  return <PermissionsCell role={role} permissionsAction={permissionsAction} />;
}

/** apiKeyRole reads the role of a project key row. */
function apiKeyRole(apiKey: ApiKeySettingsTableRow): SystemRole | null {
  if ("role" in apiKey) return apiKey.role;
  return null;
}

function toGatewayKeySettingsFilter({
  includeGatewayKeys,
  onIncludeGatewayKeysChange,
}: GatewayKeyFilter): SettingsTableFilter {
  return {
    type: "select",
    id: "gatewayKeys",
    label: "Gateway keys",
    placeholder: "Exclude gateway keys",
    options: GATEWAY_KEY_FILTER_OPTIONS,
    value: includeGatewayKeys ? ALL_KEYS : EXCLUDE_GATEWAY_KEYS,
    onChange: (value) => onIncludeGatewayKeysChange(value === ALL_KEYS),
    muted: !includeGatewayKeys,
  };
}

type ApiKeySettingsTableProps = Pick<
  TableProps<ApiKeySettingsTableRow>,
  "data" | "loadingRowCount" | "noResultsMessage"
> & {
  editNameAction: {
    hasAccess: boolean;
    onClick: (apiKey: ApiKeySettingsTableRow) => void;
  };
  /** permissionsAction adds a permissions column whose cells open the key's permissions. */
  permissionsAction?: PermissionsAction;
  hasWriteAccess: boolean;
  onDelete: (apiKey: ApiKeySettingsTableRow) => void;
  search: { value: string; onChange: (value: string) => void };
  gatewayKeyFilter?: GatewayKeyFilter;
};

type GatewayKeyFilter = {
  includeGatewayKeys: boolean;
  onIncludeGatewayKeysChange: (includeGatewayKeys: boolean) => void;
};

type SettingsTableFilter = NonNullable<
  SettingsTableProps<ApiKeySettingsTableRow>["filters"]
>[number];

/** PermissionsAction opens the permissions of a key's role. */
type PermissionsAction = {
  scope: "project" | "organization";
  onClick: (role: SystemRole) => void;
};
