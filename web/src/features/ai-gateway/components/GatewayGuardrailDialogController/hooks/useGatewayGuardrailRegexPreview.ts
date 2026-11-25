import { useState } from "react";

import type { CustomRegexPreviewControl } from "@/src/features/ai-gateway/components/GatewayGuardrailDialogController/components/GatewayGuardrailFormDialog/GatewayGuardrailFormDialog";
import {
  GATEWAY_GUARDRAIL_MAX_CUSTOM_REGEX_LENGTH,
  GATEWAY_GUARDRAIL_PREVIEW_TEXT_MAX_LENGTH,
} from "@/src/features/ai-gateway/constants/gatewayGuardrails";
import { useDebounce } from "@/src/hooks/useDebounce";
import { api, sendAsPostOption } from "@/src/utils/api";

const PREVIEW_DEBOUNCE_MS = 200;

/** Validates a custom regex and previews matches via the gateway WASM engine. */
export function useGatewayGuardrailRegexPreview(params: {
  organizationId: string;
  enabled: boolean;
  initialPattern: string;
  initialText: string;
}): CustomRegexPreviewControl {
  const [input, setInput] = useState(() => ({
    pattern: params.initialPattern,
    text: params.initialText,
  }));

  const debouncedUpdate = useDebounce(
    (pattern: string, text: string) => {
      setInput({ pattern, text });
    },
    PREVIEW_DEBOUNCE_MS,
    false,
  );

  const boundedText = input.text.slice(
    0,
    GATEWAY_GUARDRAIL_PREVIEW_TEXT_MAX_LENGTH,
  );
  const canQuery =
    params.enabled &&
    input.pattern.length > 0 &&
    input.pattern.length <= GATEWAY_GUARDRAIL_MAX_CUSTOM_REGEX_LENGTH;

  const previewQuery = api.aiGateway.guardrails.previewRegex.useQuery(
    {
      orgId: params.organizationId,
      pattern: input.pattern,
      text: boundedText,
    },
    {
      ...sendAsPostOption,
      enabled: canQuery,
      retry: false,
    },
  );

  return {
    pattern: input.pattern,
    text: boundedText,
    isFetching: canQuery && previewQuery.isFetching,
    result: canQuery ? (previewQuery.data ?? null) : null,
    onChange: debouncedUpdate,
  };
}
