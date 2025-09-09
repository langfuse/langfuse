import { Button } from "@/src/components/ui/button";
import { api } from "@/src/utils/api";
import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";

export function RetryBackgroundMigration({
  backgroundMigrationName,
  isRetryable,
}: {
  backgroundMigrationName: string;
  isRetryable: boolean;
}) {
  const utils = api.useUtils();
  const [isOpen, setIsOpen] = useState(false);
  const [adminApiKey, setAdminApiKey] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleRetry = async () => {
    if (!adminApiKey.trim()) {
      toast.error("Admin API key is required");
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/trpc/backgroundMigrations.retry", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${adminApiKey.trim()}`,
        },
        body: JSON.stringify({
          json: { name: backgroundMigrationName },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData?.error?.message || "Failed to retry background migration");
      }

      toast.success("Background migration scheduled for retry");
      void utils.backgroundMigrations.invalidate();
      setIsOpen(false);
      setAdminApiKey("");
    } catch (error) {
      console.error("Error retrying background migration:", error);
      toast.error(
        error instanceof Error 
          ? error.message 
          : "Failed to retry background migration"
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={() => setIsOpen(!isOpen)}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="xs" disabled={!isRetryable}>
          <RotateCcw className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96">
        <h2 className="text-md mb-3 font-semibold">Retry Background Migration</h2>
        <p className="mb-4 text-sm">
          This action schedules the migration for retry. Restart the worker
          containers to re-initiate the migration.
        </p>
        
        <div className="mb-4">
          <Label htmlFor="admin-api-key" className="text-sm font-medium">
            Admin API Key
          </Label>
          <Input
            id="admin-api-key"
            type="password"
            placeholder="Enter admin API key"
            value={adminApiKey}
            onChange={(e) => setAdminApiKey(e.target.value)}
            className="mt-1"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Required for security. This key must match your ADMIN_API_KEY environment variable.
          </p>
        </div>
        
        <div className="flex justify-end space-x-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setIsOpen(false);
              setAdminApiKey("");
            }}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="default"
            size="sm"
            loading={isLoading}
            onClick={handleRetry}
          >
            Retry Migration
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
