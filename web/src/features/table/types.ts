import { type Entitlement } from "@/src/features/entitlements/constants/entitlements";
import { type ProjectScope } from "@/src/features/rbac/constants/projectAccessRights";
import { type ComponentType, type ReactElement } from "react";

type BaseTableAction = {
  id: string;
  icon?: ReactElement | ComponentType<{ className?: string }>;
  accessCheck: {
    scope: ProjectScope;
    entitlement?: Entitlement;
  };
};

type CreateTableAction = BaseTableAction & {
  type: "create";
  createConfig: {
    getTargetOptions: (projectId: string) => { id: string; name: string }[];
    targetLabel: string;
  };
};

type DeleteTableAction = BaseTableAction & {
  type: "delete";
};

export type TableAction = CreateTableAction | DeleteTableAction;

export type ActionAccess = {
  hasAccess: boolean;
  hasEntitlement: boolean;
};
