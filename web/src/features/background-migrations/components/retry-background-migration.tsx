import { Button } from "@/src/components/ui/button";
import { api } from "@/src/utils/api";
import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { RotateCcw } from "lucide-react";

export function RetryBackgroundMigration({
  backgroundMigrationName,
  isRetryable,
}: {
  backgroundMigrationName: string;
  isRetryable: boolean;
}) {
  const utils = api.useUtils();
  const [isOpen, setIsOpen] = useState(false);

  const mutRetryBackgroundMigration =
    api.backgroundMigrations.retry.useMutation({
      onSuccess: () => {
        void utils.backgroundMigrations.invalidate();
      },
    });

  return (
    <Popover open={isOpen} onOpenChange={() => setIsOpen(!isOpen)}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="xs" disabled={!isRetryable}>
          <RotateCcw className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent>
        <h2 className="text-md mb-3 font-semibold">Please confirm</h2>
        <p className="mb-3 text-sm">
          This action schedules the migration for retry. Restart the worker
          containers to re-initiate the migration.
        </p>
        <div className="flex justify-end space-x-4">
          <Button
            type="button"
            variant="default"
            loading={mutRetryBackgroundMigration.isLoading}
            onClick={() => {
              void mutRetryBackgroundMigration.mutateAsync({
                name: backgroundMigrationName,
              });
              setIsOpen(false);
            }}
          >
            Retry Background Migration
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
