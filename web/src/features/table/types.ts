import { type Entitlement } from "@/src/features/entitlements/constants/entitlements";
import { type ProjectScope } from "@/src/features/rbac/constants/projectAccessRights";
import {
  type BatchActionType,
  type ActionId,
  type BatchExportTableName,
} from "@langfuse/shared";
import { type ReactElement } from "react";

type BaseTableAction = {
  id: ActionId;
  label: string;
  description: string;
  icon?: ReactElement<any>;
  disabled?: boolean;
  disabledReason?: string;
  // Batch action rows are registered per (projectId, actionId, tableName).
  // When an action dispatches under a different table than the hosting view
  // (e.g. TraceDelete from the events view registers under "traces"), set
  // this so the in-progress poll targets the table the job is stored under.
  tableName?: BatchExportTableName;
  accessCheck: {
    scope: ProjectScope;
    entitlement?: Entitlement;
  };
};

export type CreateTableAction = BaseTableAction & {
  type: BatchActionType.Create;
  targetLabel: string;
  execute: ({
    projectId,
    targetId,
  }: {
    projectId: string;
    targetId: string;
  }) => Promise<void>;
};

type DeleteTableAction = BaseTableAction & {
  type: BatchActionType.Delete;
  execute: ({ projectId }: { projectId: string }) => Promise<void>;
};

export type CustomDialogTableAction = BaseTableAction & {
  type: BatchActionType.Create;
  customDialog: true;
  // No execute or targetLabel - dialog handles everything
};

export type TableAction =
  | CreateTableAction
  | DeleteTableAction
  | CustomDialogTableAction;
