import { useMemo } from "react";
import { TrashIcon } from "lucide-react";
import { SettingsTable } from "@/src/components/SettingsTable/SettingsTable";
import { createBadgeTableColumn } from "@/src/components/design-system/table/columns/createBadgeTableColumn";
import { createButtonTableColumn } from "@/src/components/design-system/table/columns/createButtonTableColumn";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";
import { type LangfuseColumnDef } from "@/src/components/table/types";

export type SsoConfigRow = {
  domain: string;
  authProvider: string;
  authConfig: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
};

export type SsoConfigTableRow = {
  domain: string;
  config: SsoConfigRow | null;
};

const providerLabels: Record<string, string> = {
  google: "Google",
  github: "GitHub",
  "github-enterprise": "GitHub Enterprise",
  gitlab: "GitLab",
  auth0: "Auth0",
  okta: "Okta",
  authentik: "Authentik",
  onelogin: "OneLogin",
  "azure-ad": "Azure AD / Entra ID",
  cognito: "AWS Cognito",
  keycloak: "Keycloak",
  jumpcloud: "JumpCloud",
  custom: "Custom OIDC",
};

export function SsoConfigsTable({
  data,
  onConfigure,
  onDelete,
}: {
  data: SsoConfigTableRow[];
  onConfigure: (row: SsoConfigTableRow) => void;
  onDelete: (domain: string) => void;
}) {
  const columns = useMemo<LangfuseColumnDef<SsoConfigTableRow>[]>(
    () => [
      createTextTableColumn<SsoConfigTableRow>({
        accessorKey: "domain",
        header: "Domain",
      }),
      createBadgeTableColumn<SsoConfigTableRow>({
        id: "provider",
        accessorFn: (row) => row.config?.authProvider ?? "Not configured",
        header: "Provider",
        getBadge: (provider) =>
          provider === "Not configured"
            ? { value: provider, variant: "secondary" }
            : {
                value: providerLabels[provider] ?? provider,
                variant: "default",
              },
      }),
      createTextTableColumn<SsoConfigTableRow, Date>({
        accessorFn: (row) => row.config?.updatedAt,
        id: "updatedAt",
        header: "Updated",
        hideBelowMd: true,
        mapValue: (date) => date?.toLocaleDateString(),
        nullValue: "—",
      }),
      createButtonTableColumn<SsoConfigTableRow, string>({
        accessorFn: (row) => row.domain,
        id: "configure",
        header: "",
        getButton: ({ row }) => ({
          text: row.original.config ? "Update" : "Configure SSO",
          onClick: () => onConfigure(row.original),
        }),
      }),
    ],
    [onConfigure],
  );

  return (
    <SettingsTable
      tableName="SSO configurations"
      columns={columns}
      actions={(row) =>
        row.config
          ? [
              {
                id: "delete",
                type: "item",
                title: `Delete SSO for ${row.domain}`,
                icon: TrashIcon,
                variant: "destructive",
                onClick: () => onDelete(row.domain),
              },
            ]
          : []
      }
      data={{ status: "success", data }}
    />
  );
}
