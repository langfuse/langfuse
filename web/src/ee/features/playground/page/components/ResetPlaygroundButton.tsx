import { ListRestartIcon } from "lucide-react";
import { useRouter } from "next/router";

import { Button } from "@/src/components/ui/button";
import usePlaygroundCache from "@/src/ee/features/playground/page/hooks/usePlaygroundCache";
import { useHasOrgEntitlement } from "@/src/features/entitlements/hooks";

export const ResetPlaygroundButton: React.FC = () => {
  const available = useHasOrgEntitlement("playground");
  const router = useRouter();
  const { setPlaygroundCache } = usePlaygroundCache();

  const handleClick = () => {
    setPlaygroundCache(null);

    router.reload();
  };

  if (!available) return null;

  return (
    <Button
      variant={"outline"}
      title="Reset playground state"
      onClick={handleClick}
    >
      <ListRestartIcon className="mr-1 h-4 w-4" />
      <span>Reset playground</span>
    </Button>
  );
};
