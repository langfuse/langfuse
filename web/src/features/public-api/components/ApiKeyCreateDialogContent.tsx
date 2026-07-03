import React from "react";
import { Button } from "@/src/components/ui/button";
import {
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { ApiKeyDetailContent } from "@/src/features/public-api/components/ApiKeyDetailContent";

type ApiKeyScope = "project" | "organization";

export type ApiKeyCreateDialogContentProps =
  | {
      scope: ApiKeyScope;
      type: "form";
      note: string;
      onNoteChange: (value: string) => void;
      onSubmit: () => void;
      isPending?: boolean;
    }
  | (Omit<
      React.ComponentProps<typeof ApiKeyDetailContent>,
      "showMcpSection"
    > & {
      type: "detail";
    });

export function ApiKeyCreateDialogContent(
  props: ApiKeyCreateDialogContentProps,
) {
  const { scope } = props;

  if (props.type === "detail") {
    const { secretKey, publicKey, baseUrl } = props;

    return (
      <DialogContent onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>API Keys</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <ApiKeyDetailContent
            scope={scope}
            secretKey={secretKey}
            publicKey={publicKey}
            baseUrl={baseUrl}
            showMcpSection={true}
          />
        </DialogBody>
      </DialogContent>
    );
  }

  const { note, onNoteChange, onSubmit, isPending } = props;

  return (
    <DialogContent onPointerDownOutside={(e) => e.preventDefault()}>
      <DialogHeader>
        <DialogTitle>Create API Keys</DialogTitle>
      </DialogHeader>
      <DialogBody>
        <div className="space-y-4">
          <div>
            <Label htmlFor="note">Note (optional)</Label>
            <Input
              id="note"
              placeholder="Production key"
              value={note}
              onChange={(e) => onNoteChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  onSubmit();
                }
              }}
              className="mt-1.5"
            />
          </div>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button onClick={onSubmit} loading={isPending}>
          Create API keys
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
