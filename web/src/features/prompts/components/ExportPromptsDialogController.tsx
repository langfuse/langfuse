import { useId, useState, type ReactNode } from "react";

import { Banner } from "@/src/components/design-system/Banner/Banner";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { RadioGroup } from "@/src/components/design-system/RadioGroup/RadioGroup";
import { isPromptExportLimitFailure } from "@/src/features/prompts/fns/promptExportLimit";
import { showToast } from "@/src/features/notifications/showToast";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import {
  api,
  getTrpcErrorCode,
  getTrpcErrorPath,
  shouldRetryQuery,
} from "@/src/utils/api";
import { classifyTrpcToastError } from "@/src/utils/trpcErrorClassification";

type ExportMode = "latest" | "all";

const EXPORT_MODE_OPTIONS = [
  {
    value: "latest",
    label: "Latest version per prompt",
    description: "One version of each prompt.",
  },
  {
    value: "all",
    label: "All versions",
    description: "Every saved version of each prompt.",
  },
] as const satisfies ReadonlyArray<{
  value: ExportMode;
  label: string;
  description: string;
}>;

function downloadPromptExport(data: unknown, mode: ExportMode) {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `langfuse-prompts-${mode}-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function ExportModeField({
  mode,
  disabled,
  onModeChange,
}: {
  mode: ExportMode;
  disabled: boolean;
  onModeChange: (mode: ExportMode) => void;
}) {
  const groupId = useId();

  return (
    <fieldset className="flex flex-col gap-2" disabled={disabled}>
      <legend className="text-sm font-medium">What to export</legend>
      <RadioGroup
        value={mode}
        onValueChange={(value) => {
          const option = EXPORT_MODE_OPTIONS.find(
            (candidate) => candidate.value === value,
          );
          if (option) onModeChange(option.value);
        }}
      >
        {EXPORT_MODE_OPTIONS.map((option) => {
          const id = `${groupId}-${option.value}`;
          return (
            <div key={option.value} className="flex items-start gap-2">
              <div className="mt-0.5">
                <RadioGroup.Item
                  id={id}
                  value={option.value}
                  disabled={disabled}
                />
              </div>
              <label htmlFor={id} className="flex flex-col">
                <span>{option.label}</span>
                <span className="text-muted-foreground">
                  {option.description}
                </span>
              </label>
            </div>
          );
        })}
      </RadioGroup>
    </fieldset>
  );
}

type ExportResult = "exported" | "limited" | "failed";

function useExportPrompts(projectId: string) {
  const utils = api.useUtils();
  const capture = usePostHogClientCapture();
  const [isExporting, setIsExporting] = useState(false);
  const [limitMessage, setLimitMessage] = useState<string | null>(null);

  const exportPrompts = async (mode: ExportMode): Promise<ExportResult> => {
    setIsExporting(true);
    setLimitMessage(null);
    try {
      const data = await utils.prompts.exportAll.fetch(
        {
          projectId,
          includeAllVersions: mode === "all",
        },
        {
          // The version limit is a 400 the dialog explains. Silence the
          // global toast for that status; other failures still toast below
          // and still report through the query cache.
          meta: { silentHttpCodes: [400] },
          retry: (failureCount, error) =>
            !isPromptExportLimitFailure({
              code: getTrpcErrorCode(error),
              path: getTrpcErrorPath(error),
            }) && shouldRetryQuery(failureCount, error),
        },
      );
      downloadPromptExport(data, mode);
      capture("prompts:bulk_export", { mode });
      setLimitMessage(null);
      return "exported";
    } catch (error) {
      if (
        isPromptExportLimitFailure({
          code: getTrpcErrorCode(error),
          path: getTrpcErrorPath(error),
        }) &&
        error instanceof Error
      ) {
        setLimitMessage(error.message);
        return "limited";
      }

      showToast({
        type: "ERROR",
        title: "Failed to export prompts. Please try again.",
        analytics: classifyTrpcToastError(error, "prompt.export"),
      });
      return "failed";
    } finally {
      setIsExporting(false);
    }
  };

  return {
    exportPrompts,
    isExporting,
    limitMessage,
    clearLimitMessage: () => setLimitMessage(null),
  };
}

export function ExportPromptsDialogController({
  projectId,
  children,
}: {
  projectId: string;
  children: (control: {
    isExporting: boolean;
    openDialog: () => void;
  }) => ReactNode;
}) {
  const [mode, setMode] = useState<ExportMode>("latest");
  const { exportPrompts, isExporting, limitMessage, clearLimitMessage } =
    useExportPrompts(projectId);

  return (
    <DialogController
      onBeforeClose={() => !isExporting}
      renderDialog={({ closeDialog }) => (
        <Dialog
          title="Export prompts"
          size="sm"
          actions={[
            {
              label: "Export",
              loading: isExporting,
              disabled: isExporting || limitMessage !== null,
              disabledReason:
                limitMessage !== null
                  ? "This project is over the export limit."
                  : undefined,
              onClick: () => {
                exportPrompts(mode)
                  .then((result) => {
                    if (result === "exported") closeDialog();
                  })
                  .catch(() => undefined);
              },
            },
          ]}
        >
          <Dialog.Body>
            <p>Download this project&apos;s prompts as JSON.</p>
            <ExportModeField
              mode={mode}
              disabled={isExporting}
              onModeChange={setMode}
            />
            {limitMessage !== null ? (
              <Banner variant="error">{limitMessage}</Banner>
            ) : null}
          </Dialog.Body>
        </Dialog>
      )}
    >
      {({ openDialog }) =>
        children({
          isExporting,
          openDialog: () => {
            clearLimitMessage();
            openDialog();
          },
        })
      }
    </DialogController>
  );
}
