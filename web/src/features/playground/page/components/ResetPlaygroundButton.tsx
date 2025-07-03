import { ListRestartIcon } from "lucide-react";
import { useRouter } from "next/router";

import { Button } from "@/src/components/ui/button";
import { usePersistedWindowIds } from "@/src/features/playground/page/hooks/usePersistedWindowIds";
import { useModelParams } from "@/src/features/playground/page/hooks/useModelParams";

export const ResetPlaygroundButton: React.FC = () => {
  const router = useRouter();
  const { clearAllCaches } = usePersistedWindowIds();
  const { clearModelPreferences } = useModelParams();

  const handleClick = () => {
    // Clear all playground caches and reset window IDs
    clearAllCaches();

    // Clear model preferences from localStorage
    clearModelPreferences();

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
