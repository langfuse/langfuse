import { Layer } from "@/src/components/ui/layer";
import { VersionUpdateBannerView } from "./VersionUpdateBannerView";

/**
 * App-wide notification rendered into the top-most overlay layer (`toast`) so
 * it floats above content rather than pushing page chrome down.
 */
export function VersionUpdateBanner({
  onReload,
  onDismiss,
}: {
  onReload: () => void;
  onDismiss: () => void;
}) {
  return (
    <Layer name="toast">
      <VersionUpdateBannerView onReload={onReload} onDismiss={onDismiss} />
    </Layer>
  );
}
