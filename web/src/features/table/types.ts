import { type Entitlement } from "@/src/features/entitlements/constants/entitlements";
import { type ProjectScope } from "@/src/features/rbac/constants/projectAccessRights";
import { type queryHooks } from "@/src/features/table/components/queryHooks";
import { type RouterInputs } from "@/src/utils/api";
import { type ActionId } from "@langfuse/shared";
import { type ComponentType, type ReactElement } from "react";

type TableActionCreateInput =
  RouterInputs["annotationQueueItems"]["createMany"];

type TableActionDeleteInput = RouterInputs["traces"]["deleteMany"];

type BaseTableAction = {
  id: ActionId;
  icon?: ReactElement | ComponentType<{ className?: string }>;
  accessCheck: {
    scope: ProjectScope;
    entitlement?: Entitlement;
  };
};

export type TargetOptionsRoute = keyof typeof queryHooks;

export type TableActionQueryConfig = {
  targetLabel: string;
  entitlement: Entitlement;
  targetQueryRoute: TargetOptionsRoute;
};

type CreateTableAction = BaseTableAction & {
  type: "create";
  translateToMutationInput: (params: {
    projectId: string;
    itemIds: string[];
    targetId: string;
  }) => TableActionCreateInput;
  // defines properties to query for target options in the create action
  queryConfig: TableActionQueryConfig;
};

type DeleteTableAction = BaseTableAction & {
  type: "delete";
  translateToMutationInput: (params: {
    projectId: string;
    itemIds: string[];
  }) => TableActionDeleteInput;
};

export type TableAction = CreateTableAction | DeleteTableAction;

export type ActionAccess = {
  hasAccess: boolean;
  hasEntitlement: boolean;
};
