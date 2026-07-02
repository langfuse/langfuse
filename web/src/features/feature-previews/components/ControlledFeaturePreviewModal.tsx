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
  const state: Partial<Record<PreviewFlag, PreviewState>> = {};

  return (
    <FeaturePreviewModal
      open={open}
      onOpenChange={onOpenChange}
      state={state}
    />
  );
}
