import { useId, useState, type SyntheticEvent } from "react";

import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";

export function TestMediaObjectDialog({
  closeDialog,
  isPending,
  onTest,
}: {
  closeDialog: () => void;
  isPending: boolean;
  onTest: (uri: string) => Promise<boolean>;
}) {
  const [uri, setUri] = useState("");
  const formId = useId();
  const inputId = useId();

  const handleSubmit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (await onTest(uri.trim())) closeDialog();
  };

  return (
    <Dialog
      title="Test external media object"
      actions={[
        {
          disabled: !uri.trim(),
          form: formId,
          label: "Test media object",
          loading: isPending,
          type: "submit",
        },
      ]}
    >
      <Dialog.Body>
        <p className="text-muted-foreground text-sm">
          Enter an existing canonical S3 URI from this integration&apos;s media
          prefix. Langfuse will test server-side read access, then test browser
          access through a signed URL.
        </p>
        <form id={formId} className="grid gap-2" onSubmit={handleSubmit}>
          <Label htmlFor={inputId}>S3 URI</Label>
          <Input
            id={inputId}
            value={uri}
            placeholder="s3://bucket/media/image.png"
            disabled={isPending}
            onChange={(event) => setUri(event.target.value)}
          />
        </form>
      </Dialog.Body>
    </Dialog>
  );
}
