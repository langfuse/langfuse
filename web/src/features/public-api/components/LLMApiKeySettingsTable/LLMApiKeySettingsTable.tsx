import { useCallback, useMemo, type ReactNode } from "react";
import { Pencil, PlusIcon, Route, Trash } from "lucide-react";
import { SiAnthropic, SiOpenai } from "react-icons/si";
import { LLMAdapter } from "@langfuse/shared";

import { Badge } from "@/src/components/design-system/Badge/Badge";
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import { type TableProps } from "@/src/components/design-system/table/Table";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";
import {
  SettingsTable,
  type SettingsTableProps,
} from "@/src/components/SettingsTable/SettingsTable";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import type { LlmApiKeyListItem } from "@/src/features/public-api/components/CreateLLMApiKeyForm";

export type LLMApiKeySettingsTableRow = LlmApiKeyListItem & {
  overriddenByProject?: boolean;
};

export function LLMApiKeySettingsTable({
  actionsDisabledReason,
  createAction,
  deleteAction,
  emptyState,
  tableName = "LLM connections",
  updateAction,
  ...tableProps
}: Pick<
  TableProps<LLMApiKeySettingsTableRow>,
  "actionsDisabledReason" | "data" | "loadingRowCount"
> & {
  createAction: { hasAccess: boolean; label: string; onClick: () => void };
  deleteAction: {
    hasAccess: boolean;
    onClick: (apiKey: LLMApiKeySettingsTableRow) => void;
  };
  emptyState: ReactNode;
  updateAction: {
    hasAccess: boolean;
    onClick: (apiKey: LLMApiKeySettingsTableRow) => void;
  };
  tableName?: string;
  toolbarContent?: ReactNode;
}) {
  const showExtraHeaderKeys =
    tableProps.data.status === "success" &&
    tableProps.data.data.some((apiKey) => apiKey.extraHeaderKeys.length > 0);

  const columns = useMemo<LangfuseColumnDef<LLMApiKeySettingsTableRow>[]>(
    () => [
      {
        accessorKey: "provider",
        header: "Provider",
        enableResizing: false,
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <span>{row.original.provider}</span>
            {row.original.overriddenByProject ? (
              <Tooltip label="This project connection overrides the organization secret with the same name.">
                {({ getTriggerProps }) => (
                  <span {...getTriggerProps()}>
                    <Badge text="Override" size="sm" color="filled" />
                  </span>
                )}
              </Tooltip>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: "adapter",
        header: "Adapter",
        enableResizing: false,
        cell: ({ row }) => <AdapterName adapter={row.original.adapter} />,
      },
      createTextTableColumn<LLMApiKeySettingsTableRow>({
        accessorKey: "baseURL",
        header: "Base URL",
        nullValue: "default",
        enableResizing: false,
      }),
      createTextTableColumn<LLMApiKeySettingsTableRow>({
        accessorKey: "displaySecretKey",
        header: "API Key",
        enableResizing: false,
      }),
      ...(showExtraHeaderKeys
        ? [
            createTextTableColumn<LLMApiKeySettingsTableRow, string[]>({
              accessorKey: "extraHeaderKeys",
              header: "Extra headers",
              mapValue: (value) => value?.join(", "),
              enableResizing: false,
            }),
          ]
        : []),
    ],
    [showExtraHeaderKeys],
  );

  const actions = useCallback<
    NonNullable<TableProps<LLMApiKeySettingsTableRow>["actions"]>
  >(
    (apiKey) => {
      if (!updateAction.hasAccess && !deleteAction.hasAccess) {
        return [];
      }
      return [
        {
          id: "edit",
          type: "item",
          title: "Edit connection",
          icon: Pencil,
          disabled: updateAction.hasAccess
            ? undefined
            : { reason: "You do not have permission to edit this connection" },
          onClick: () => updateAction.onClick(apiKey),
        },
        {
          id: "delete",
          type: "item",
          title: "Delete connection",
          icon: Trash,
          variant: "destructive",
          disabled: deleteAction.hasAccess
            ? undefined
            : {
                reason: "You do not have permission to delete this connection",
              },
          onClick: () => deleteAction.onClick(apiKey),
        },
      ];
    },
    [deleteAction, updateAction],
  );

  const toolbarActions: SettingsTableProps<LLMApiKeySettingsTableRow>["toolbarActions"] =
    createAction.hasAccess
      ? [
          {
            id: "add-connection",
            label: createAction.label,
            variant: "secondary",
            icon: <PlusIcon className="icon-base" aria-hidden="true" />,
            onClick: createAction.onClick,
          },
        ]
      : undefined;

  return (
    <SettingsTable
      tableName={tableName}
      columns={columns}
      actions={actions}
      actionsDisabledReason={actionsDisabledReason}
      emptyState={emptyState}
      toolbarActions={toolbarActions}
      onRowClick={updateAction.hasAccess ? updateAction.onClick : undefined}
      {...tableProps}
    />
  );
}

const adapterLabels: Record<LLMAdapter, string> = {
  [LLMAdapter.Anthropic]: "Anthropic",
  [LLMAdapter.OpenAI]: "OpenAI",
  [LLMAdapter.Azure]: "Azure OpenAI",
  [LLMAdapter.Bedrock]: "Amazon Bedrock",
  [LLMAdapter.VertexAI]: "Vertex AI",
  [LLMAdapter.GoogleAIStudio]: "Google AI Studio",
  [LLMAdapter.TypeSafe]: "Type-safe",
};

function AdapterName({ adapter }: { adapter: LLMAdapter }) {
  return (
    <div className="flex items-center gap-2">
      <span className="bg-muted flex size-7 items-center justify-center rounded-md border">
        <AdapterIcon adapter={adapter} />
      </span>
      <span>{adapterLabels[adapter]}</span>
    </div>
  );
}

function AdapterIcon({ adapter }: { adapter: LLMAdapter }) {
  if (adapter === LLMAdapter.OpenAI || adapter === LLMAdapter.Azure) {
    return <SiOpenai className="icon-base" aria-hidden="true" />;
  }
  if (adapter === LLMAdapter.Anthropic) {
    return <SiAnthropic className="icon-base" aria-hidden="true" />;
  }
  return <Route className="icon-base" aria-hidden="true" />;
}
