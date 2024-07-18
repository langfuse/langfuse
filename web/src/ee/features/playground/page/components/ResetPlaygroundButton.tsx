import { ListRestartIcon } from "lucide-react";
import { useRouter } from "next/router";

import { Button } from "@/src/components/ui/button";
import usePlaygroundCache from "@/src/ee/features/playground/page/hooks/usePlaygroundCache";
import { useIsEeEnabled } from "@/src/ee/utils/useIsEeEnabled";

export const ResetPlaygroundButton: React.FC = () => {
  const isEeEnabled = useIsEeEnabled();
  const router = useRouter();
  const { setPlaygroundCache } = usePlaygroundCache();

  const handleClick = () => {
    setPlaygroundCache(null);

    router.reload();
  };

  if (!isEeEnabled) return null;

  return (
    <Button
      variant={"outline"}
      title="Reset playground state"
      onClick={handleClick}
    >
      <ListRestartIcon className="mr-1 h-5 w-5" />
      <span>Reset playground</span>
    </Button>
  );
};
