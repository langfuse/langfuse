import {
  FeaturePreviewModal,
  type PreviewFlag,
  type PreviewState,
} from "./FeaturePreviewModal";

type ControlledFeaturePreviewModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ControlledFeaturePreviewModal({
  open,
  onOpenChange,
}: ControlledFeaturePreviewModalProps) {
  const state: Partial<Record<PreviewFlag, PreviewState>> = {
    // The "Filter Search Bar" preview is retired — the bar is now generally
    // available on the v4 events tables for everyone (see useSearchBarEnabled),
    // so it no longer renders a tile here. The `searchBar` flag plumbing
    // (PreviewFlag type, registry entry, the userAccount allowlist) is kept for
    // now so a rollback is a one-line revert; restore the `searchBar: { ... }`
    // state entry to bring the tile back.
    // TODO(remove ~2026-06-19): delete the dead searchBar plumbing once the GA
    // rollout is confirmed stable — see useSearchBarEnabled for the full list.
  };

  return (
    <FeaturePreviewModal
      open={open}
      onOpenChange={onOpenChange}
      state={state}
    />
  );
}
