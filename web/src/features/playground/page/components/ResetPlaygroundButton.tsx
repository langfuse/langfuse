import { ListRestartIcon } from "lucide-react";
import { useRouter } from "next/router";

import { Button } from "@/src/components/ui/button";
import usePlaygroundCache from "@/src/features/playground/page/hooks/usePlaygroundCache";

export const ResetPlaygroundButton: React.FC = () => {
  const router = useRouter();
  const { setPlaygroundCache } = usePlaygroundCache();

  const handleClick = () => {
    setPlaygroundCache(null);

    router.reload();
  };

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
