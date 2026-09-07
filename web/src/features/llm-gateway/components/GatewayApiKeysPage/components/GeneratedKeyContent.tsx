import { SubHeader } from "@/src/components/layouts/header";
import { CodeView } from "@/src/components/ui/CodeJsonViewer";
import { DialogBody } from "@/src/components/ui/dialog";

export function GeneratedKeyContent({
  generatedKeys,
}: {
  generatedKeys: { publicKey: string; secretKey: string };
}) {
  return (
    <DialogBody className="ph-no-capture">
      <div>
        <SubHeader title="Secret Key" />
        <p className="text-muted-foreground text-sm">
          This key can only be viewed once. You can always create new keys in
          the organization settings.
        </p>
        <CodeView content={generatedKeys.secretKey} className="mt-2" />
      </div>
    </DialogBody>
  );
}
