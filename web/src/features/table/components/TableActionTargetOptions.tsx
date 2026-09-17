import { SelectItem } from "@/src/components/ui/select";
import { useOptionalEntitlement } from "@/src/features/entitlements";
import { targetOptionsQueryMap } from "./targetOptionsQueryMap";
import { type TableAction } from "../types";
import { useSession } from "next-auth/react";

export function TableActionTargetOptions({
  action,
  projectId,
}: {
  action: TableAction;
  projectId: string;
}) {
  const session = useSession();
  const hasEntitlement = useOptionalEntitlement(action.accessCheck.entitlement);
  const useTargetOptionsQuery =
    targetOptionsQueryMap[action.id as keyof typeof targetOptionsQueryMap]();

  const targetOptions = useTargetOptionsQuery(
    { projectId },
    { enabled: session.status === "authenticated" && hasEntitlement },
  );

  return targetOptions.data?.map((option: { id: string; name: string }) => (
    <SelectItem key={option.id} value={option.id}>
      {option.name}
    </SelectItem>
  ));
}
