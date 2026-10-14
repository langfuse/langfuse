"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as React from "react";

type DialogControl<State> = {
  isOpen: boolean;
  openDialog: (...args: [State] extends [void] ? [] : [state: State]) => void;
};

type UncontrolledProps<State> = {
  initialState?: () => State | undefined;
  children: (control: DialogControl<State>) => React.ReactNode;
  open?: never;
  onOpenChange?: never;
};

/**
 * The caller owns `open`, so it can read or change it outside the dialog.
 * Content is not remounted between opens: keep state that must survive a
 * close above the controller.
 */
type ControlledProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialState?: never;
  children?: (control: DialogControl<void>) => React.ReactNode;
};

type DialogControllerProps<State = void> = {
  onBeforeClose?: () => boolean;
  onDismiss?: () => void;
  renderDialog: (control: {
    state: State;
    closeDialog: () => void;
  }) => React.ReactNode;
} & (
  | UncontrolledProps<State>
  | ([State] extends [void] ? ControlledProps : never)
);

function DialogController<State = void>({
  initialState,
  children,
  onBeforeClose,
  onDismiss,
  renderDialog,
  open,
  onOpenChange,
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

  const isOpen =
    open ??
    (controllerState.status === "initialized" && controllerState.isOpen);

  const closeDialog = () => {
    if (onBeforeClose?.() === false) return false;

    if (onOpenChange) {
      onOpenChange(false);
      return true;
    }
    setControllerState((currentState) =>
      currentState.status === "initialized"
        ? { ...currentState, isOpen: false }
        : currentState,
    );
    return true;
  };

  const openDialog = (
    ...args: [State] extends [void] ? [] : [state: State]
  ) => {
    if (onOpenChange) {
      onOpenChange(true);
      return;
    }
    setControllerState((currentState) => ({
      status: "initialized",
      isOpen: true,
      state: args[0] as State,
      openCount:
        currentState.status === "initialized" ? currentState.openCount + 1 : 0,
    }));
  };

  const uncontrolledContent =
    controllerState.status === "initialized" ? (
      // Keep the closed content mounted for Radix's exit animation, but
      // start a fresh content instance whenever the dialog opens again.
      <React.Fragment key={controllerState.openCount}>
        {renderDialog({ state: controllerState.state, closeDialog })}
      </React.Fragment>
    ) : null;

  return (
    <DialogPrimitive.Root
      open={isOpen}
      onOpenChange={(nextOpen) => {
        if (nextOpen) return;
        if (closeDialog()) onDismiss?.();
      }}
    >
      {children?.({ isOpen, openDialog })}
      {onOpenChange
        ? renderDialog({ state: undefined as State, closeDialog })
        : uncontrolledContent}
    </DialogPrimitive.Root>
  );
}

export { DialogController };
