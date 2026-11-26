import { useRef } from "react";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import {
  UpsertModelFormDialogContent,
  type UpsertModelFormProps,
} from "./UpsertModelFormDialogContent";

type DialogChild = (control: { openDialog: () => void }) => React.ReactNode;
type UpsertModelDialogProps = UpsertModelFormProps & { children: DialogChild };

export const UpsertModelFormDialogController = (({
  children,
  ...props
}: UpsertModelDialogProps) => {
  const guard = useRef<() => boolean>(() => true);

  return (
    <DialogController<true>
      onBeforeClose={() => guard.current()}
      renderDialog={({ closeDialog }) => (
        <UpsertModelFormDialogContent
          {...props}
          closeDialog={closeDialog}
          closeGuardRef={guard}
        />
      )}
    >
      {({ openDialog }) =>
        children({
          openDialog: () => {
            openDialog(true);
          },
        })
      }
    </DialogController>
  );
}) as React.FC<UpsertModelDialogProps>;
