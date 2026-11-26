import { type ComponentProps } from "react";
import { fn } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { modelMaintainerByScope } from "@/src/features/models/modelMaintainer";
import {
  ModelDefinitionsTable,
  type ModelTableRow,
} from "./ModelDefinitionsTable";

const meta = preview.meta({ component: ModelDefinitionsTable });

const row = ({
  id,
  name,
  scope,
  editable,
  isOverridden = false,
}: {
  id: string;
  name: string;
  scope: ModelTableRow["serverResponse"]["scope"];
  editable: boolean;
  isOverridden?: boolean;
}): ModelTableRow => ({
  modelId: id,
  maintainer: modelMaintainerByScope[scope],
  modelName: name,
  matchPattern: `(?i)^(${name})$`,
  editable,
  isOverridden,
  serverResponse: {
    id,
    scope,
    projectId: scope === "PROJECT" ? "project-1" : null,
    modelName: name,
    matchPattern: `(?i)^(${name})$`,
    tokenizerId: null,
    tokenizerConfig: null,
    pricingTiers: [],
  },
});

const sharedArgs = {
  pagination: {
    mode: "offset",
    totalCount: 4,
    state: { pageIndex: 0, pageSize: 50 },
    onChange: fn(),
  },
  search: { value: "", onChange: fn() },
  rowHeight: "m",
  onRowHeightChange: fn(),
  toolbarActions: [
    { id: "add-model", label: "Add Model Definition", onClick: fn() },
  ],
  modelActions: {
    canEdit: true,
    onClone: fn(),
    onEdit: fn(),
    onDelete: fn(),
  },
  onRowClick: fn(),
} satisfies Partial<ComponentProps<typeof ModelDefinitionsTable>>;

export const ProjectModels = meta.story({
  args: {
    ...sharedArgs,
    data: {
      status: "success",
      data: [
        row({ id: "p1", name: "acme-chat", scope: "PROJECT", editable: true }),
        row({
          id: "o1",
          name: "acme-chat",
          scope: "ORGANIZATION",
          editable: false,
          isOverridden: true,
        }),
        row({
          id: "o2",
          name: "acme-embed",
          scope: "ORGANIZATION",
          editable: false,
        }),
        row({ id: "l1", name: "gpt-4o", scope: "LANGFUSE", editable: false }),
      ],
    },
    lastUsed: { p1: new Date("2026-11-19"), o2: new Date("2026-11-18") },
    cloneLabel: "Clone to project",
  },
});

export const OrganizationModels = meta.story({
  args: {
    ...sharedArgs,
    data: {
      status: "success",
      data: [
        row({
          id: "o1",
          name: "acme-chat",
          scope: "ORGANIZATION",
          editable: true,
        }),
        row({
          id: "o3",
          name: "gpt-4o",
          scope: "ORGANIZATION",
          editable: true,
        }),
        row({
          id: "l1",
          name: "gpt-4o",
          scope: "LANGFUSE",
          editable: false,
          isOverridden: true,
        }),
        row({
          id: "l2",
          name: "claude-sonnet-4-5",
          scope: "LANGFUSE",
          editable: false,
        }),
      ],
    },
    cloneLabel: "Clone to organization",
  },
});

export const Loading = meta.story({
  args: {
    ...ProjectModels.input.args,
    data: { status: "loading" },
    lastUsed: "loading",
  },
});
