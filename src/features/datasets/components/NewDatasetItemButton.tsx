import { Button } from "@/src/components/ui/button";
import { PlusIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { cn } from "@/src/utils/tailwind";
import { useState } from "react";
import { env } from "@/src/env.mjs";
import { NewDatasetItemForm } from "@/src/features/datasets/components/NewDatasetItemForm";
import { DialogTrigger } from "@radix-ui/react-dialog";

export const NewDatasetItemButton = (props: {
  projectId: string;
  datasetId?: string;
}) => {
  const [open, setOpen] = useState(false);
  if (env.NEXT_PUBLIC_ENABLE_EXPERIMENTAL_FEATURES !== "true") return null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon className={cn("-ml-0.5 mr-1.5")} aria-hidden="true" />
          Add to dataset
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="mb-5">Create new dataset item</DialogTitle>
        </DialogHeader>
        <NewDatasetItemForm
          projectId={props.projectId}
          datasetId={props.datasetId}
          onFormSuccess={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
};
