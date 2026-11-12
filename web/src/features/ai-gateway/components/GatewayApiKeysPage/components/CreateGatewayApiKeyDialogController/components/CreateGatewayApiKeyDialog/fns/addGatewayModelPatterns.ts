import { toTypedGatewayModelPattern } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/CreateGatewayApiKeyDialogController/components/CreateGatewayApiKeyDialog/fns/toTypedGatewayModelPattern";

/** Adds the comma-separated patterns typed in the models input, skipping blanks and duplicates. */
export const addGatewayModelPatterns = (
  patterns: readonly string[],
  draft: string,
) => [
  ...new Set([
    ...patterns,
    ...draft.split(",").flatMap((text) => {
      const pattern = toTypedGatewayModelPattern(text);
      return pattern === null ? [] : [pattern];
    }),
  ]),
];
