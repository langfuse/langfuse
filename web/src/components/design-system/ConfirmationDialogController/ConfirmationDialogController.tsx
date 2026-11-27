/* eslint-disable boundaries/dependencies */
"use client";

import * as React from "react";

import { Banner } from "../Banner/Banner";
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
  loading: externalLoading = false,
  onAfterDismiss,
  onConfirm,
  text,
  title,
  variant,
}: {
  children: (control: {
    isOpen: boolean;
    openDialog: ConfirmationDialogValueCallback<TValue, void>;
  }) => React.ReactNode;
  confirmationText?: ConfirmationDialogContent<TValue>;
  confirmLabel: string;
  disabled?: boolean;
  error?: string;
  loading?: boolean;
  onAfterDismiss?: () => void;
  onConfirm: ConfirmationDialogValueCallback<TValue, void | Promise<void>>;
  text: ConfirmationDialogContent<TValue>;
  title: ConfirmationDialogContent<TValue>;
  variant: "default" | "destructive";
}) {
  const [confirmationInput, setConfirmationInput] = React.useState("");
  const [confirming, setConfirming] = React.useState(false);
  const loading = externalLoading || confirming;

  const [selectedValue, setSelectedValue] = React.useState<TValue>();

  const confirmationInputId = React.useId();
  const resolvedConfirmationText = React.useMemo(() => {
    if (typeof confirmationText !== "function") return confirmationText;
    if (selectedValue === undefined) return undefined;
    return (confirmationText as (value: TValue) => string)(selectedValue);
  }, [confirmationText, selectedValue]);
  const requiresConfirmationInput = Boolean(resolvedConfirmationText);

  const resolvedTitle = React.useMemo(() => {
    if (typeof title === "string") return title;
    if (selectedValue === undefined) return "";
    return (title as (value: TValue) => string)(selectedValue);
  }, [title, selectedValue]);

  const resolvedText = React.useMemo(() => {
    if (typeof text === "string") return text;
    if (selectedValue === undefined) return "";
    return (text as (value: TValue) => string)(selectedValue);
  }, [text, selectedValue]);

  return (
    <DialogController
      onBeforeClose={() => !loading}
      onDismiss={() => {
        onAfterDismiss?.();
      }}
      renderDialog={({ closeDialog }) => (
        <Dialog
          title={resolvedTitle}
          actions={[
            {
              disabled:
                disabled ||
                (requiresConfirmationInput &&
                  confirmationInput !== resolvedConfirmationText),
              label: confirmLabel,
              loading,
              onClick: async () => {
                if (loading) return;
                setConfirming(true);
                try {
                  await (
                    onConfirm as (
                      value: TValue | undefined,
                    ) => void | Promise<void>
                  )(selectedValue);
                } catch {
                  return;
                } finally {
                  setConfirming(false);
                }
                closeDialog();
              },
              variant,
            },
          ]}
        >
          <Dialog.Body>
            <p className="text-muted-foreground text-sm">{resolvedText}</p>
            {error ? (
              <Banner variant="error" title="Error">
                <p className="whitespace-pre-wrap">{error}</p>
              </Banner>
            ) : null}
            {requiresConfirmationInput ? (
              <div className="grid gap-2">
                <Label
                  htmlFor={confirmationInputId}
                  className="flex flex-wrap items-center gap-1.5"
                >
                  <span>To confirm, enter the required value:</span>
                  <code className="bg-muted text-foreground rounded px-1.5 py-0.5 font-mono text-sm leading-none">
                    {resolvedConfirmationText}
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
            setConfirmationInput("");
            setSelectedValue(() => value);
            control.openDialog();
          }) as ConfirmationDialogValueCallback<TValue, void>,
        })
      }
    </DialogController>
  );
}

export { ConfirmationDialogController };
