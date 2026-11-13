import { Check, Copy } from "@langfuse/icons";

import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import { useCopyToClipboard } from "@/src/hooks/useCopyToClipboard";
import { formatGatewayModelSlug } from "@/src/features/ai-gateway/fns/formatGatewayModelSlug";

/** Copies the `connectionName:modelId` slug, which routes to this exact credential. */
export function CopyModelIdButton({
  connectionName,
  modelId,
}: {
  connectionName: string;
  modelId: string;
}) {
  const { copy, isCopied } = useCopyToClipboard();
  const slug = formatGatewayModelSlug(connectionName, modelId);

  const handleCopy = async () => {
    try {
      await copy(slug);
    } catch {
      // Clipboard writes can be rejected when the browser denies permission.
    }
  };

  return (
    <Tooltip label={isCopied ? "Copied" : "Copy model ID"}>
      {({ getTriggerProps }) => (
        <IconButton
          {...getTriggerProps()}
          icon={isCopied ? Check : Copy}
          label={isCopied ? `Copied ${slug}` : `Copy ${slug}`}
          variant="toolbar"
          size="xs"
          onClick={handleCopy}
        />
      )}
    </Tooltip>
  );
}
