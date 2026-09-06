import { registeredProviders } from "../../conventions";

/** `role`/`content` are the universal message keys; every other container
 * key is provider vocabulary contributed via `messageLikeKeys`. */
export function isMessageLike(value: Record<string, unknown>): boolean {
  if ("role" in value || "content" in value) return true;
  return registeredProviders.some((provider) => {
    for (const key of provider.messageLikeKeys ?? []) {
      if (key in value) return true;
    }
    return false;
  });
}

/** Tool-definition messages fold: shapes only a convention can recognize. */
export function isToolDefinitionMessage(
  message: Record<string, unknown>,
): boolean {
  return registeredProviders.some(
    (provider) => provider.isToolDefinitionMessage?.(message) ?? false,
  );
}
