import { Button } from "@/src/components/ui/button";
import { api } from "@/src/utils/api";
import { useState } from "react";
import type * as React from "react";
import { PopoverController } from "@/src/components/ui/popover";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { toast } from "sonner";

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
  const utils = api.useUtils();
  const [adminApiKey, setAdminApiKey] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const mutRetryBackgroundMigration =
    api.backgroundMigrations.retry.useMutation({
      onSuccess: () => {
        utils.backgroundMigrations.invalidate();
        toast.success("Migration scheduled for retry");
      },
      onError: (error) => {
        toast.error(error?.message || "Failed to retry migration");
      },
      onSettled: () => {
        setIsLoading(false);
      },
    });

  const handleRetry = async (closePopover: () => void) => {
    if (!adminApiKey.trim()) {
      toast.error("Admin API key is required");
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
          <h2 className="mb-3 font-bold">Retry Background Migration</h2>
          <p className="mb-4 text-sm">
            This action schedules the migration for retry. Restart the worker
            containers to re-initiate the migration.
          </p>

          <div className="mb-4">
            <Label htmlFor="admin-api-key" className="text-sm font-bold">
              Admin API Key
            </Label>
            <Input
              id="admin-api-key"
              type="password"
              placeholder="Enter admin API key"
              value={adminApiKey}
              onChange={(e) => setAdminApiKey(e.target.value)}
              className="mt-1"
              disabled={isLoading}
              autoComplete="off"
              inputMode="text"
              name="admin-api-key"
            />
            <p className="text-muted-foreground mt-1 text-xs">
              Required for security. This key must match your ADMIN_API_KEY
              environment variable{" ("}
              <a
                href="https://langfuse.com/self-hosting/administration/organization-management-api#authentication"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-primary underline"
              >
                Docs
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
              Cancel
            </Button>
            <Button
              type="button"
              variant="default"
              loading={isLoading}
              onClick={() => handleRetry(closePopover)}
              disabled={isLoading}
            >
              Retry Migration
            </Button>
          </div>
        </>
      )}
    >
      {children}
    </PopoverController>
  );
}
