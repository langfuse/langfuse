/* eslint-disable @repo/no-abstracted-overlay-trigger */
import { useHasProjectAccess } from "@/src/features/rbac";
import { useState } from "react";

import { Button } from "@/src/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { type GetModelResult } from "@/src/features/models/validation";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { api } from "@/src/utils/api";
import { useTranslations } from "next-intl";

export const DeleteModelButton = ({
  modelData,
  projectId,
  onSuccess,
}: {
  modelData: GetModelResult;
  projectId: string;
  onSuccess?: () => void;
}) => {
  const t = useTranslations("settingsEnterprise.models.actions");
  const [isOpen, setIsOpen] = useState(false);
  const utils = api.useUtils();
  const capture = usePostHogClientCapture();
  const mut = api.models.delete.useMutation({
    onSuccess: () => {
      utils.models.invalidate();
      onSuccess?.();
    },
  });

  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "models:CUD",
  });

  return (
    <Popover open={isOpen} onOpenChange={() => setIsOpen(!isOpen)}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          title={t("deleteTitle")}
          disabled={!hasAccess}
          className="border-light-red flex items-center"
        >
          <span className="text-dark-red">{t("delete")}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent>
        <h2 className="mb-3 font-bold">{t("confirm")}</h2>
        <p className="mb-3 text-sm">{t("deleteDescription")}</p>
        <div className="flex justify-end space-x-4">
          <Button
            type="button"
            variant="destructive"
            loading={mut.isPending}
            onClick={() => {
              capture("models:delete_button_click");
              mut.mutateAsync({
                projectId,
                modelId: modelData.id,
              });

              setIsOpen(false);
            }}
          >
            {t("deleteModel")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};
