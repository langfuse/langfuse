/* eslint-disable boundaries/dependencies */
"use client";

import * as React from "react";

import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";

type ConfirmationDialogValueCallback<TValue, TResult> = [TValue] extends [
  undefined,
]
  ? () => TResult
  : (value: TValue) => TResult;

type ConfirmationDialogContent<TValue> =
  | string
  | ([TValue] extends [undefined] ? never : (value: TValue) => string);

function ConfirmationDialogController<TValue = undefined>({
  children,
  confirmationText,
  confirmLabel,
  disabled = false,
  error,
  loading = false,
  onConfirm,
  text,
  title,
  variant,
}: {
  children: (control: {
    isOpen: boolean;
    openDialog: ConfirmationDialogValueCallback<TValue, void>;
  }) => React.ReactNode;
  confirmationText?: string;
  confirmLabel: string;
  disabled?: boolean;
  error?: string;
  loading?: boolean;
  onConfirm: ConfirmationDialogValueCallback<TValue, void | Promise<void>>;
  text: ConfirmationDialogContent<TValue>;
  title: ConfirmationDialogContent<TValue>;
  variant: "default" | "destructive";
}) {
  const [confirmationInput, setConfirmationInput] = React.useState("");

  const [selectedValue, setSelectedValue] = React.useState<TValue>();

  const confirmationInputId = React.useId();
  const requiresConfirmationInput = Boolean(confirmationText);

  let resolvedTitle = "";
  if (typeof title === "string") {
    resolvedTitle = title;
  } else if (selectedValue !== undefined) {
    resolvedTitle = (title as (value: TValue) => string)(selectedValue);
  }

  let resolvedText = "";
  if (typeof text === "string") {
    resolvedText = text;
  } else if (selectedValue !== undefined) {
    resolvedText = (text as (value: TValue) => string)(selectedValue);
  }

  return (
    <DialogController
      onBeforeClose={() => !loading}
      onDismiss={() => {
        setConfirmationInput("");
        setSelectedValue(undefined);
      }}
      renderDialog={({ closeDialog }) => (
        <Dialog
          title={resolvedTitle}
          actions={[
            {
              disabled:
                disabled ||
                (requiresConfirmationInput &&
                  confirmationInput !== confirmationText),
              label: confirmLabel,
              loading,
              onClick: async () => {
                try {
                  await (
                    onConfirm as (
                      value: TValue | undefined,
                    ) => void | Promise<void>
                  )(selectedValue);
                } catch {
                  return;
                }
                closeDialog();
                setConfirmationInput("");
              },
              variant,
            },
          ]}
        >
          <Dialog.Body>
            <p className="text-muted-foreground text-sm">{resolvedText}</p>
            {error ? (
              <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <p className="font-bold">Error:</p>
                <p className="whitespace-pre-wrap">{error}</p>
              </div>
            ) : null}
            {requiresConfirmationInput ? (
              <div className="grid gap-2">
                <Label
                  htmlFor={confirmationInputId}
                  className="flex flex-wrap items-center gap-1.5"
                >
                  <span>To confirm, enter the required value:</span>
                  <code className="bg-muted text-foreground rounded px-1.5 py-0.5 font-mono text-sm leading-none">
                    {confirmationText}
                  </code>
                </Label>
                <Input
                  id={confirmationInputId}
                  value={confirmationInput}
                  onChange={(event) => setConfirmationInput(event.target.value)}
                  disabled={loading}
                />
              </div>
            ) : null}
          </Dialog.Body>
        </Dialog>
      )}
    >
      {(control) =>
        children({
          isOpen: control.isOpen,
          openDialog: ((value?: TValue) => {
            setSelectedValue(() => value);
            control.openDialog();
          }) as ConfirmationDialogValueCallback<TValue, void>,
        })
      }
    </DialogController>
  );
}

export { ConfirmationDialogController };
