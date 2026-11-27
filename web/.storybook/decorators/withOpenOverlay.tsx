"use client";

import { useLayoutEffect, useRef } from "react";
import type { Decorator } from "@storybook/nextjs-vite";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";

type OpenOverlayContext = {
  args: { isOverriding?: boolean };
};

type OpenOverlayParameter = {
  /**
   * Return false to keep the overlay open. Called with the story context so
   * the veto can follow the current args.
   */
  onBeforeClose?: (context: OpenOverlayContext) => boolean;
};

function OpenTrigger({ openDialog }: { openDialog: () => void }) {
  const openRef = useRef(openDialog);
  openRef.current = openDialog;

  useLayoutEffect(() => {
    openRef.current();
  }, []);

  return (
    <button
      type="button"
      tabIndex={-1}
      aria-hidden="true"
      className="sr-only"
      onClick={() => openDialog()}
    >
      Open
    </button>
  );
}

/**
 * Storybook-only. Opens a dialog through DialogController's trigger after
 * mount, so the story renders the dialog content and nothing else.
 * Application code cannot import this module.
 */
export const withOpenOverlay: Decorator = (Story, context) => {
  const parameter = context.parameters.openOverlay as
    | OpenOverlayParameter
    | undefined;

  return (
    <DialogController
      onBeforeClose={
        parameter?.onBeforeClose
          ? () => parameter.onBeforeClose!(context) !== false
          : undefined
      }
      renderDialog={() => <Story />}
    >
      {({ openDialog }) => <OpenTrigger openDialog={openDialog} />}
    </DialogController>
  );
};
