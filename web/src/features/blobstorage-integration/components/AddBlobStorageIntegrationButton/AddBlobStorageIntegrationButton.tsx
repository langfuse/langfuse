import { Plus } from "lucide-react";

import { Button } from "@/src/components/design-system/Button/Button";

export function AddBlobStorageIntegrationButton({
  canLoadConfig,
  showDetails,
  onClick,
}: {
  canLoadConfig: boolean;
  showDetails: boolean;
  onClick: () => void;
}) {
  if (!canLoadConfig || showDetails) {
    return null;
  }

  return <Button text="Add integration" icon={Plus} onClick={onClick} />;
}
