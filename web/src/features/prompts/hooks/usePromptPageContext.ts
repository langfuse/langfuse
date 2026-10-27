import { useMemo } from "react";
import { useRouter } from "next/router";

import {
  buildPromptPageContext,
  usePublishPageContext,
} from "@/src/features/page-context";

type PromptOnScreen = Parameters<typeof buildPromptPageContext>[0]["prompt"] & {
  id: string;
};

/** Publishes the prompt version on screen as the page context. */
export function usePromptPageContext(
  prompt: PromptOnScreen | undefined,
  versionCount: number,
) {
  const { asPath } = useRouter();
  const snapshot = useMemo(
    () =>
      prompt
        ? buildPromptPageContext({ prompt, versionCount, path: asPath })
        : null,
    [asPath, prompt, versionCount],
  );
  usePublishPageContext(snapshot);
}
