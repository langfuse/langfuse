/* eslint-disable boundaries/dependencies */
"use client";

import * as React from "react";

import { Dialog } from "../Dialog/Dialog";
import { DialogController } from "../DialogController/DialogController";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";

function ConfirmationDialogController({
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
    openDialog: () => void;
  }) => React.ReactNode;
  confirmationText?: string;
  confirmLabel: string;
  disabled?: boolean;
  error?: string;
  loading?: boolean;
  onConfirm: () => void | Promise<void>;
  text: string;
  title: string;
  variant: "default" | "destructive";
}) {
  const [confirmationInput, setConfirmationInput] = React.useState("");
  const confirmationInputId = React.useId();
  const requiresConfirmationInput = Boolean(confirmationText);

  return (
    <DialogController
      onBeforeClose={() => !loading}
      onDismiss={() => setConfirmationInput("")}
      renderDialog={({ closeDialog }) => (
        <Dialog
          title={title}
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
                  await onConfirm();
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
            <p className="text-muted-foreground text-sm">{text}</p>
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
      {children}
    </DialogController>
  );
}

export { ConfirmationDialogController };
