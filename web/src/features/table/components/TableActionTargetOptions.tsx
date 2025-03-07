import { SelectItem } from "@/src/components/ui/select";
import { useOptionalEntitlement } from "@/src/features/entitlements/hooks";
import { targetOptionsQueryMap } from "@/src/features/table/components/targetOptionsQueryMap";
import { type TableAction } from "@/src/features/table/types";
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
    targetOptionsQueryMap[action.id as keyof typeof targetOptionsQueryMap];

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
