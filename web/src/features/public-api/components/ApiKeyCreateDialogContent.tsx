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
import { useTranslations } from "next-intl";

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
  const t = useTranslations("accessSettings.apiKeys");

  if (props.type === "detail") {
    const { secretKey, publicKey, baseUrl } = props;

    return (
      <DialogContent closeOnInteractionOutside>
        <DialogHeader>
          <DialogTitle>{t("detailTitle")}</DialogTitle>
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
    <DialogContent closeOnInteractionOutside>
      <DialogHeader>
        <DialogTitle>{t("createTitle")}</DialogTitle>
      </DialogHeader>
      <DialogBody>
        <div className="space-y-4">
          <div>
            <Label htmlFor="note">{t("noteOptional")}</Label>
            <Input
              id="note"
              placeholder={t("notePlaceholder")}
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
          {t("create")}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
