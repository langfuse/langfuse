import { Button } from "@/src/components/ui/button";
import { api } from "@/src/utils/api";
import { useState } from "react";
import type * as React from "react";
import { PopoverController } from "@/src/components/ui/popover";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

type RetryBackgroundMigrationPopoverControllerProps = {
  backgroundMigrationName: string;
  isRetryable: boolean;
  children: React.ComponentProps<typeof PopoverController>["children"];
};

export function RetryBackgroundMigrationPopoverController({
  backgroundMigrationName,
  isRetryable,
  children,
}: RetryBackgroundMigrationPopoverControllerProps) {
  const t = useTranslations("systemUi.backgroundMigration");
  const utils = api.useUtils();
  const [adminApiKey, setAdminApiKey] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const mutRetryBackgroundMigration =
    api.backgroundMigrations.retry.useMutation({
      onSuccess: () => {
        utils.backgroundMigrations.invalidate();
        toast.success(t("retryScheduled"));
      },
      onError: (error) => {
        toast.error(error?.message || t("retryFailed"));
      },
      onSettled: () => {
        setIsLoading(false);
      },
    });

  const handleRetry = async (closePopover: () => void) => {
    if (!adminApiKey.trim()) {
      toast.error(t("apiKeyRequired"));
      return;
    }
    setIsLoading(true);
    try {
      await mutRetryBackgroundMigration.mutateAsync({
        name: backgroundMigrationName,
        adminApiKey: "Bearer " + adminApiKey.trim(),
      });
      closePopover();
      setAdminApiKey("");
    } catch (_e) {
      // Error handled in onError
    }
  };

  return (
    <PopoverController
      align="center"
      contentClassName="w-96"
      disabled={!isRetryable}
      modal={false}
      renderContent={({ closePopover }) => (
        <>
          <h2 className="mb-3 font-bold">{t("title")}</h2>
          <p className="mb-4 text-sm">{t("description")}</p>

          <div className="mb-4">
            <Label htmlFor="admin-api-key" className="text-sm font-bold">
              {t("apiKey")}
            </Label>
            <Input
              id="admin-api-key"
              type="password"
              placeholder={t("apiKeyPlaceholder")}
              value={adminApiKey}
              onChange={(e) => setAdminApiKey(e.target.value)}
              className="mt-1"
              disabled={isLoading}
              autoComplete="off"
              inputMode="text"
              name="admin-api-key"
            />
            <p className="text-muted-foreground mt-1 text-xs">
              {t("apiKeyHelp")}
              {" ("}
              <a
                href="https://langfuse.com/self-hosting/administration/organization-management-api#authentication"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-primary underline"
              >
                {t("docs")}
              </a>
              ).
            </p>
          </div>

          <div className="flex justify-end space-x-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                closePopover();
                setAdminApiKey("");
              }}
              disabled={isLoading}
            >
              {t("cancel")}
            </Button>
            <Button
              type="button"
              variant="default"
              loading={isLoading}
              onClick={() => handleRetry(closePopover)}
              disabled={isLoading}
            >
              {t("retry")}
            </Button>
          </div>
        </>
      )}
    >
      {children}
    </PopoverController>
  );
}
