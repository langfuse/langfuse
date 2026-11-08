import { Check, Copy } from "@langfuse/icons";

import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { useCopyToClipboard } from "@/src/hooks/useCopyToClipboard";

export function CopyModelIdButton({ modelId }: { modelId: string }) {
  const { copy, isCopied } = useCopyToClipboard();

  const handleCopy = async () => {
    try {
      await copy(modelId);
    } catch {
      // Clipboard writes can be rejected when the browser denies permission.
    }
  };

  return (
    <IconButton
      icon={isCopied ? Check : Copy}
      label={isCopied ? `Copied ${modelId}` : `Copy ${modelId}`}
      variant="toolbar"
      size="xs"
      onClick={handleCopy}
    />
  );
}
