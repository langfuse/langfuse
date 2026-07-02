import { SubHeader } from "@/src/components/layouts/header";
import { CodeView } from "@/src/components/ui/CodeJsonViewer";
import { Button } from "@/src/components/ui/button";
import {
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { getLangfuseEnvCode } from "@/src/features/public-api/hooks/useLangfuseEnvCode";

type ApiKeyScope = "project" | "organization";

type ApiKeyCreateDialogBaseProps = {
  scope: ApiKeyScope;
};

type ApiKeyCreateDialogFormProps = ApiKeyCreateDialogBaseProps & {
  type: "form";
  note: string;
  onNoteChange: (value: string) => void;
  onSubmit: () => void;
  isPending?: boolean;
};

type ApiKeyCreateDialogDetailProps = ApiKeyCreateDialogBaseProps & {
  type: "detail";
  secretKey: string;
  publicKey: string;
  baseUrl: string;
};

export type ApiKeyCreateDialogContentProps =
  | ApiKeyCreateDialogFormProps
  | ApiKeyCreateDialogDetailProps;

export function ApiKeyCreateDialogContent(
  props: ApiKeyCreateDialogContentProps,
) {
  const { scope } = props;

  if (props.type === "detail") {
    const { secretKey, publicKey, baseUrl } = props;
    const envCode = getLangfuseEnvCode(baseUrl, { secretKey, publicKey });

    return (
      <DialogContent onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>API Keys</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-6">
            <div>
              <SubHeader title="Secret Key" />
              <div className="text-muted-foreground text-sm">
                This key can only be viewed once. You can always create new keys
                in the {scope} settings.
              </div>
              <CodeView content={secretKey} className="mt-2" />
            </div>
            <div>
              <SubHeader title="Public Key" />
              <CodeView content={publicKey} className="mt-2" />
            </div>
            <div>
              <SubHeader title=".env" />
              <CodeView content={envCode} className="mt-2" />
            </div>
          </div>
        </DialogBody>
      </DialogContent>
    );
  }

  const { note, onNoteChange, onSubmit, isPending } = props;

  return (
    <DialogContent onPointerDownOutside={(e) => e.preventDefault()}>
      <DialogHeader>
        <DialogTitle>Create API Keys</DialogTitle>
      </DialogHeader>
      <DialogBody>
        <div className="space-y-4">
          <div>
            <Label htmlFor="note">Note (optional)</Label>
            <Input
              id="note"
              placeholder="Production key"
              value={note}
              onChange={(e) => onNoteChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  onSubmit();
                }
              }}
              className="mt-1.5"
            />
          </div>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button onClick={onSubmit} loading={isPending}>
          Create API keys
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
