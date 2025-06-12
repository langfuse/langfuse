import { PenIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/src/components/ui/dialog";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import { useUiCustomization } from "@/src/ee/features/ui-customization/useUiCustomization";
import { EditLLMApiKeyForm } from "@/src/features/public-api/components/EditLLMApiKeyForm";
import { api } from "@/src/utils/api";

interface EditLLMApiKeyDialogProps {
  apiKeyId: string;
  trigger?: React.ReactNode;
}

export function EditLLMApiKeyDialog({
  apiKeyId,
  trigger,
}: EditLLMApiKeyDialogProps) {
  const projectId = useProjectIdFromURL();
  const [open, setOpen] = useState(false);
  const utils = api.useUtils();
  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "llmApiKeys:update",
  });
  const uiCustomization = useUiCustomization();

  // Fetch all API keys to find the one we're editing
  const {
    data: apiKeysData,
    isLoading,
    error,
  } = api.llmApiKey.all.useQuery(
    {
      projectId: projectId as string,
    },
    {
      enabled: Boolean(projectId) && open, // Only fetch when dialog is open
      retry: false, // Don't retry on error to show immediate feedback
    },
  );

  // Find the specific API key to edit
  const apiKeyToEdit = apiKeysData?.data?.find((key) => key.id === apiKeyId);

  if (!hasAccess) return null;

  const defaultTrigger = (
    <Button variant="ghost" size="sm">
      <PenIcon className="h-4 w-4" />
    </Button>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        setOpen(isOpen);
      }}
    >
      <DialogTrigger asChild>{trigger || defaultTrigger}</DialogTrigger>
      <DialogContent className="max-h-[90%] min-w-[40vw] overflow-auto">
        <DialogHeader>
          <DialogTitle>Edit LLM API key</DialogTitle>
        </DialogHeader>
        {open && (
          <>
            {isLoading ? (
              <div className="flex justify-center py-8">
                <div className="text-muted-foreground">Loading...</div>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center space-y-2 py-8">
                <div className="text-destructive">Failed to load API key</div>
                <div className="text-sm text-muted-foreground">
                  {error.message || "An unexpected error occurred"}
                </div>
              </div>
            ) : apiKeyToEdit ? (
              <EditLLMApiKeyForm
                projectId={projectId}
                apiKeyData={{
                  id: apiKeyToEdit.id,
                  provider: apiKeyToEdit.provider,
                  adapter: apiKeyToEdit.adapter,
                  baseURL: apiKeyToEdit.baseURL ?? undefined,
                  displaySecretKey: apiKeyToEdit.displaySecretKey,
                  customModels: apiKeyToEdit.customModels || [],
                  withDefaultModels: apiKeyToEdit.withDefaultModels,
                  extraHeaderKeys: apiKeyToEdit.extraHeaderKeys || [],
                  updatedAt: apiKeyToEdit.updatedAt,
                }}
                existingApiKeys={apiKeysData?.data?.map((key) => ({
                  id: key.id,
                  provider: key.provider,
                }))}
                onSuccess={() => {
                  setOpen(false);
                  // Refresh the parent API keys list
                  utils.llmApiKey.all.invalidate({
                    projectId: projectId as string,
                  });
                }}
                customization={uiCustomization}
              />
            ) : (
              <div className="flex flex-col items-center justify-center space-y-3 py-8">
                <div className="text-center text-muted-foreground">
                  <div className="font-medium">API key not found</div>
                  <div className="mt-1 text-sm">
                    This API key may have been deleted by another user. Please
                    close this dialog and reopen it to try again.
                  </div>
                </div>
                <Button
                  variant="outline"
                  onClick={() => {
                    setOpen(false);
                    // Refresh the parent API keys list
                    utils.llmApiKey.all.invalidate({
                      projectId: projectId as string,
                    });
                  }}
                >
                  Close & Refresh
                </Button>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
