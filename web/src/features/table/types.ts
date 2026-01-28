import { type Entitlement } from "@/src/features/entitlements/constants/entitlements";
import { type ProjectScope } from "@/src/features/rbac/constants/projectAccessRights";
import { type BatchActionType, type ActionId } from "@langfuse/shared";
import { type ReactElement } from "react";

type BaseTableAction = {
  id: ActionId;
  label: string;
  description: string;
  icon?: ReactElement<any>;
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
