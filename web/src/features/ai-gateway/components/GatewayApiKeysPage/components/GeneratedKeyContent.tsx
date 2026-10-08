import { CodeSection } from "@/src/components/design-system/CodeSection/CodeSection";
import { DialogBody } from "@/src/components/ui/dialog";

export function GeneratedKeyContent({
  generatedKeys,
}: {
  generatedKeys: { publicKey: string; secretKey: string };
}) {
  return (
    <DialogBody className="ph-no-capture">
      <div>
        <p className="text-muted-foreground text-sm">
          This key can only be viewed once. You can always create new keys in
          the organization settings.
        </p>
        <div className="mt-2">
          <CodeSection variant="outline" copyValue={generatedKeys.secretKey}>
            {generatedKeys.secretKey}
          </CodeSection>
        </div>
      </div>
    </DialogBody>
  );
}
