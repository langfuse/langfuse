import { ListRestartIcon } from "lucide-react";
import { useRouter } from "next/router";

import { Button } from "@/src/components/ui/button";
import usePlaygroundCache from "@/src/ee/features/playground/page/hooks/usePlaygroundCache";
import { getIsCloudEnvironment } from "@/src/ee/utils/getIsCloudEnvironment";

export const ResetPlaygroundButton: React.FC = () => {
  const router = useRouter();
  const { setPlaygroundCache } = usePlaygroundCache();

  const handleClick = () => {
    setPlaygroundCache(null);

    router.reload();
  };

  return getIsCloudEnvironment() ? (
    <Button
      variant={"outline"}
      title="Reset playground state"
      onClick={handleClick}
    >
      <ListRestartIcon className="mr-1 h-5 w-5" />
      <span>Reset playground</span>
    </Button>
  ) : null;
};
