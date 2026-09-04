import { KeyRound } from "lucide-react";

import { Alert } from "@/src/components/design-system/Alert/Alert";
import { CodeView } from "@/src/components/ui/CodeJsonViewer";
import { DialogBody } from "@/src/components/ui/dialog";
import { Label } from "@/src/components/ui/label";

export function GeneratedKeyContent({
  generatedKeys,
}: {
  generatedKeys: { publicKey: string; secretKey: string };
}) {
  return (
    <DialogBody className="ph-no-capture">
      <Alert variant="warning" icon={KeyRound}>
        <Alert.Title>Copy the secret key now</Alert.Title>
        <Alert.Description>
          The secret key is displayed only once and cannot be recovered.
        </Alert.Description>
      </Alert>
      <div>
        <Label>Public key</Label>
        <CodeView content={generatedKeys.publicKey} className="mt-1.5" />
      </div>
      <div>
        <Label>Secret key</Label>
        <CodeView content={generatedKeys.secretKey} className="mt-1.5" />
      </div>
    </DialogBody>
  );
}
