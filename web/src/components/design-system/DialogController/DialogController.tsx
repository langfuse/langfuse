"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as React from "react";

type DialogControllerProps<State = void> = {
  initialState?: () => State | undefined;
  children: (control: {
    isOpen: boolean;
    openDialog: (...args: [State] extends [void] ? [] : [state: State]) => void;
  }) => React.ReactNode;
  onBeforeClose?: () => boolean;
  onDismiss?: () => void;
  renderDialog: (control: {
    state: State;
    closeDialog: () => void;
  }) => React.ReactNode;
};

function DialogController<State = void>({
  initialState,
  children,
  onBeforeClose,
  onDismiss,
  renderDialog,
}: DialogControllerProps<State>) {
  const [controllerState, setControllerState] = React.useState<
    | { status: "uninitialized" }
    | { status: "initialized"; isOpen: boolean; state: State }
  >(() => {
    const state = initialState?.();
    return state === undefined
      ? { status: "uninitialized" }
      : { status: "initialized", isOpen: true, state };
  });

  const closeDialog = () => {
    if (onBeforeClose?.() === false) return false;

    setControllerState((currentState) =>
      currentState.status === "initialized"
        ? { ...currentState, isOpen: false }
        : currentState,
    );
    return true;
  };

  return (
    <DialogPrimitive.Root
      open={controllerState.status === "initialized" && controllerState.isOpen}
      onOpenChange={(open) => {
        if (open) return;
        if (closeDialog()) onDismiss?.();
      }}
    >
      {children({
        isOpen:
          controllerState.status === "initialized" && controllerState.isOpen,
        openDialog: (...args) =>
          setControllerState({
            status: "initialized",
            isOpen: true,
            state: args[0] as State,
          }),
      })}
      {controllerState.status === "initialized"
        ? renderDialog({ state: controllerState.state, closeDialog })
        : null}
    </DialogPrimitive.Root>
  );
}

export { DialogController };
