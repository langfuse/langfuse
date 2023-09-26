import { Button } from "@/src/components/ui/button";
import { PlusIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { useState } from "react";
import { DialogTrigger } from "@radix-ui/react-dialog";
import { NewDatasetForm } from "@/src/features/datasets/components/NewDatasetForm";

export const NewDatasetButton = (props: {
  projectId: string;
  datasetId?: string;
  className?: string;
}) => {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" className={props.className}>
          <PlusIcon className="-ml-0.5 mr-1.5" aria-hidden="true" />
          New dataset
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="mb-5">Create new dataset</DialogTitle>
        </DialogHeader>
        <NewDatasetForm
          projectId={props.projectId}
          onFormSuccess={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
};
