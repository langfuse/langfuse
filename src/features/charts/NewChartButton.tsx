import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { NewChartForm } from "@/src/features/charts/NewChartForm";
import { useHasAccess } from "@/src/features/rbac/utils/checkAccess";
import { DialogTrigger } from "@radix-ui/react-dialog";
import { LockIcon, PlusIcon } from "lucide-react";
import { useState } from "react";

export const NewChartButton = (props: {
  projectId: string;
  className?: string;
}) => {
  const [open, setOpen] = useState(false);
  // const hasAccess = useHasAccess({
  //   projectId: props.projectId,
  //   scope: "datasets:CUD",
  // });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="secondary"
          className={props.className}
          // disabled={!hasAccess}
        >
          {/* {hasAccess ? ( */}
          <PlusIcon className="-ml-0.5 mr-1.5" aria-hidden="true" />
          {/* ) : (
            <LockIcon className="-ml-0.5 mr-1.5 h-3 w-3" aria-hidden="true" />
          )} */}
          New chart
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="mb-5">Create new chart</DialogTitle>
        </DialogHeader>
        <NewChartForm
          projectId={props.projectId}
          onFormSuccess={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
};
