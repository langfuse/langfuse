import { type ComponentProps, useState } from "react";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { Input } from "@/src/components/design-system/Input/Input";

function MetadataKeysDialog({
  onConfirm,
}: {
  onConfirm: (keys: [string, string]) => void;
}) {
  const [first, setFirst] = useState("");
  const [second, setSecond] = useState("");
  return (
    <Dialog
      noCapture
      title="Compare metadata coverage"
      actions={[
        {
          label: "Build comparison",
          disabled: !first.trim() || !second.trim(),
          onClick: () => onConfirm([first.trim(), second.trim()]),
        },
      ]}
    >
      <Dialog.Body>
        <p>
          Choose the two metadata keys to count. Observations with both keys
          appear in both populations.
        </p>
        <label className="flex flex-col gap-1.5 text-xs font-bold">
          First metadata key
          <Input
            aria-label="First metadata key"
            value={first}
            onChange={(event) => setFirst(event.target.value)}
            placeholder="Metadata key"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-bold">
          Second metadata key
          <Input
            aria-label="Second metadata key"
            value={second}
            onChange={(event) => setSecond(event.target.value)}
            placeholder="Metadata key"
          />
        </label>
      </Dialog.Body>
    </Dialog>
  );
}

export function StudioMetadataComparisonController({
  onCreate,
  children,
}: {
  onCreate: (keys: [string, string]) => void;
  children: ComponentProps<typeof DialogController<void>>["children"];
}) {
  return (
    <DialogController
      renderDialog={({ closeDialog }) => (
        <MetadataKeysDialog
          onConfirm={(keys) => {
            closeDialog();
            onCreate(keys);
          }}
        />
      )}
    >
      {children}
    </DialogController>
  );
}
