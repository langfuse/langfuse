import { useState } from "react";

import { Button } from "@/src/components/design-system/Button/Button";
import { Tag } from "@/src/components/design-system/Tag/Tag";
import { providerIcons } from "@/src/features/ai-gateway/constants/providerIcons";
import type { GatewayEnabledModel } from "@/src/features/ai-gateway/types/gatewayEnabledModel";

const COLLAPSED_COUNT = 8;
const PAGE_SIZE = 40;

type AllowedModelsPreviewProps = {
  models: GatewayEnabledModel[];
};

export function AllowedModelsPreview({ models }: AllowedModelsPreviewProps) {
  const [visibleCount, setVisibleCount] = useState(COLLAPSED_COUNT);
  const hiddenCount = Math.max(models.length - visibleCount, 0);

  const handleViewMore = () => setVisibleCount((count) => count + PAGE_SIZE);
  const handleViewLess = () => setVisibleCount(COLLAPSED_COUNT);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-muted-foreground text-sm">Allowed models</p>
      {models.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No enabled models match these patterns.
        </p>
      ) : (
        <ul className="flex flex-wrap items-center gap-1">
          {models.slice(0, visibleCount).map((model) => (
            <li key={model.slug} title={model.slug}>
              <Tag text={model.model} icon={providerIcons[model.provider]} />
            </li>
          ))}
          {hiddenCount > 0 ? (
            <li>
              <Button
                text={`View ${hiddenCount} more`}
                variant="text"
                size="sm"
                onClick={handleViewMore}
              />
            </li>
          ) : null}
          {visibleCount > COLLAPSED_COUNT ? (
            <li>
              <Button
                text="View less"
                variant="text"
                size="sm"
                onClick={handleViewLess}
              />
            </li>
          ) : null}
        </ul>
      )}
    </div>
  );
}
