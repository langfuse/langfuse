"use client";

import { type ComponentProps } from "react";
import { useSession } from "next-auth/react";
import { api } from "@/src/utils/api";
import { getSafeImageUrl } from "@/src/utils/safe-url";
import {
  SafeImageController,
  type SafeImageState,
} from "@/src/components/design-system/SafeImageController/SafeImageController";

export function ConnectedSafeImageController({
  src,
  children,
}: Pick<ComponentProps<typeof SafeImageController>, "src" | "children">) {
  // Arbitrary URLs always require consent, even if another view has fetched them.
  const safeSrc = getSafeImageUrl(src);
  if (!safeSrc) {
    return children({ status: "error", src, message: "Cannot load image" });
  }
  return (
    <SafeImageController src={safeSrc} isDefaultVisible={false}>
      {(state) => (
        <ConnectedImageValidation src={safeSrc} state={state}>
          {children}
        </ConnectedImageValidation>
      )}
    </SafeImageController>
  );
}

function ConnectedImageValidation({
  src,
  state,
  children,
}: Pick<ComponentProps<typeof SafeImageController>, "src" | "children"> & {
  state: SafeImageState;
}) {
  const session = useSession();
  const validation = api.utilities.validateImgUrl.useQuery(src, {
    enabled: session.status === "authenticated" && state.status === "ready",
  });

  if (session.status !== "authenticated") {
    return children({
      status: "error",
      src,
      message: "Images not rendered on public traces and observations",
    });
  }
  if (state.status !== "ready") return children(state);

  if (validation.isError || validation.data?.isValid === false) {
    return children({ status: "error", src, message: "Cannot load image" });
  }
  if (!validation.data?.isValid) return children({ status: "loading" });
  return children(state);
}
