import { PlusIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { useState } from "react";
import { NewDatasetItemForm } from "@/src/features/datasets/components/NewDatasetItemForm";
import { DialogTrigger } from "@radix-ui/react-dialog";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { ActionButton } from "@/src/components/ActionButton";
import { useTranslations } from "next-intl";

export const NewDatasetItemButton = (props: {
  projectId: string;
  datasetId?: string;
}) => {
  const t = useTranslations("coreDetails.datasets.dialogs");
  const [open, setOpen] = useState(false);
  const hasAccess = useHasProjectAccess({
    projectId: props.projectId,
    scope: "datasets:CUD",
  });
  return (
    <Dialog open={hasAccess && open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <ActionButton
          variant="outline"
          hasAccess={hasAccess}
          trackingEventName="dataset_item:new_form_open"
          icon={<PlusIcon className="h-4 w-4" aria-hidden="true" />}
        >
          {t("newItem")}
        </ActionButton>
      </DialogTrigger>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>{t("createItem")}</DialogTitle>
        </DialogHeader>
        <NewDatasetItemForm
          projectId={props.projectId}
          datasetId={props.datasetId}
          onFormSuccess={() => setOpen(false)}
          className="h-full overflow-y-auto"
        />
      </DialogContent>
    </Dialog>
  );
};
