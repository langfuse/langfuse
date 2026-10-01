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
    | {
        status: "initialized";
        isOpen: boolean;
        state: State;
        openCount: number;
      }
  >(() => {
    const state = initialState?.();
    return state === undefined
      ? { status: "uninitialized" }
      : { status: "initialized", isOpen: true, state, openCount: 0 };
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
          setControllerState((currentState) => ({
            status: "initialized",
            isOpen: true,
            state: args[0] as State,
            openCount:
              currentState.status === "initialized"
                ? currentState.openCount + 1
                : 0,
          })),
      })}
      {controllerState.status === "initialized" ? (
        // Keep the closed content mounted for Radix's exit animation, but
        // start a fresh content instance whenever the dialog opens again.
        <React.Fragment key={controllerState.openCount}>
          {renderDialog({ state: controllerState.state, closeDialog })}
        </React.Fragment>
      ) : null}
    </DialogPrimitive.Root>
  );
}

export { DialogController };
