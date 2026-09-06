import { useState } from "react";
import { SplashScreen } from "@/src/components/ui/splash-screen";
import { Braces, Code, ListTree, Upload } from "lucide-react";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/src/components/ui/dialog";
import { CsvUploadDialog } from "@/src/features/datasets/components/CsvUploadDialog";
import { NewDatasetItemForm } from "@/src/features/datasets/components/NewDatasetItemForm";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { cn } from "@/src/utils/tailwind";
import { useTranslations } from "next-intl";

interface DatasetItemEntryPointRowProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick?: () => void;
  hasAccess?: boolean;
}

const DatasetItemEntryPointRow = ({
  icon,
  title,
  description,
  onClick,
  hasAccess = true,
}: DatasetItemEntryPointRowProps) => {
  const t = useTranslations("sharedUi.onboarding.datasetItems");
  const disabled = !hasAccess;
  return (
    <div
      role="button"
      tabIndex={0}
      aria-disabled={disabled}
      className={cn(
        "border-border flex h-20 items-center gap-4 rounded-lg border p-4 transition-colors",
        disabled
          ? "bg-muted text-muted-foreground opacity-60"
          : "bg-card hover:bg-accent/50 cursor-pointer",
      )}
      onClick={!disabled ? onClick : undefined}
      onKeyDown={
        !disabled
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      title={!hasAccess ? t("noAccess") : undefined}
    >
      <div className="flex items-center">{icon}</div>
      <div className="flex flex-1 flex-col gap-1">
        <h3 className="font-bold">{title}</h3>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
    </div>
  );
};

export const DatasetItemsOnboarding = ({
  projectId,
  datasetId,
}: {
  projectId: string;
  datasetId: string;
}) => {
  const t = useTranslations("sharedUi.onboarding.datasetItems");
  const capture = usePostHogClientCapture();
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [isNewItemDialogOpen, setIsNewItemDialogOpen] = useState(false);

  const hasProjectAccess = useHasProjectAccess({
    projectId,
    scope: "datasets:CUD",
  });

  return (
    <SplashScreen title={t("title")} description={t("description")}>
      <div className="flex flex-col gap-4">
        <CsvUploadDialog
          open={hasProjectAccess && isUploadDialogOpen}
          onOpenChange={setIsUploadDialogOpen}
          projectId={projectId}
          datasetId={datasetId}
        >
          <DialogTrigger asChild disabled={!hasProjectAccess}>
            <DatasetItemEntryPointRow
              icon={<Upload className="h-5 w-5" />}
              title={t("uploadTitle")}
              description={t("uploadDescription")}
              onClick={() => {
                if (hasProjectAccess) {
                  capture("dataset_item:upload_csv_button_click");
                }
              }}
              hasAccess={hasProjectAccess}
            />
          </DialogTrigger>
        </CsvUploadDialog>

        <Dialog
          open={hasProjectAccess && isNewItemDialogOpen}
          onOpenChange={setIsNewItemDialogOpen}
        >
          <DialogTrigger asChild disabled={!hasProjectAccess}>
            <DatasetItemEntryPointRow
              icon={<Braces className="h-5 w-5" />}
              title={t("manualTitle")}
              description={t("manualDescription")}
              onClick={() => {
                if (hasProjectAccess) {
                  capture("dataset_item:new_form_open");
                }
              }}
              hasAccess={hasProjectAccess}
            />
          </DialogTrigger>
          <DialogContent size="lg">
            <DialogHeader>
              <DialogTitle>{t("create")}</DialogTitle>
            </DialogHeader>
            <NewDatasetItemForm
              projectId={projectId}
              datasetId={datasetId}
              onFormSuccess={() => setIsNewItemDialogOpen(false)}
              className="h-full overflow-y-auto"
            />
          </DialogContent>
        </Dialog>

        <Link
          href="https://langfuse.com/docs/evaluation/experiments/datasets#create-items-from-production-data"
          target="_blank"
        >
          <DatasetItemEntryPointRow
            icon={<Code className="h-5 w-5" />}
            title={t("codeTitle")}
            description={t("codeDescription")}
          />
        </Link>

        <Link href={`/project/${projectId}/observations`}>
          <DatasetItemEntryPointRow
            icon={<ListTree className="h-5 w-5" />}
            title={t("observationsTitle")}
            description={t("observationsDescription")}
            onClick={() => {
              capture("dataset_item:select_observations_button_click");
            }}
          />
        </Link>
      </div>
    </SplashScreen>
  );
};
