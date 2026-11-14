import { useState } from "react";

import { Badge } from "@/src/components/design-system/Badge/Badge";
import { Button } from "@/src/components/design-system/Button/Button";
import type { GatewayEnabledModel } from "@/src/features/ai-gateway/types/gatewayEnabledModel";

const COLLAPSED_COUNT = 8;
const PAGE_SIZE = 40;

type AllowedModelsPreviewProps = {
  models: GatewayEnabledModel[];
  /** Connections whose models couldn't be loaded, so none of theirs are listed. */
  unknownCatalogConnectionNames: string[];
};

export function AllowedModelsPreview({
  models,
  unknownCatalogConnectionNames,
}: AllowedModelsPreviewProps) {
  const [visibleCount, setVisibleCount] = useState(COLLAPSED_COUNT);
  const hiddenCount = Math.max(models.length - visibleCount, 0);

  const handleViewMore = () => setVisibleCount((count) => count + PAGE_SIZE);
  const handleViewLess = () => setVisibleCount(COLLAPSED_COUNT);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-muted-foreground text-sm">Allowed models</p>
      {unknownCatalogConnectionNames.length > 0 ? (
        <p className="text-muted-foreground text-sm">
          {`Couldn't load the models of ${unknownCatalogConnectionNames.join(", ")}, so they aren't listed. The key can still call the ones these patterns match.`}
        </p>
      ) : null}
      {models.length === 0 && unknownCatalogConnectionNames.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No enabled models match these patterns.
        </p>
      ) : null}
      {models.length > 0 ? (
        <ul className="ph-no-capture flex flex-wrap items-center gap-1">
          {models.slice(0, visibleCount).map((model) => (
            <li key={model.slug}>
              <Badge text={model.model} title={model.slug} color="filled" />
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
      ) : null}
    </div>
  );
}
