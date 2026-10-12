import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Button } from "@/src/components/ui/button";

export function ConnectionModelsLoadError({
  organizationId,
  retry,
}: {
  organizationId: string;
  retry: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Link
        className="text-muted-foreground hover:text-foreground flex w-fit items-center gap-1 text-sm"
        href={`/organization/${encodeURIComponent(organizationId)}/settings/ai-gateway-providers`}
      >
        <ArrowLeft className="icon-sm" />
        Provider credentials
      </Link>
      <Alert variant="destructive">
        <Alert.Title>Provider models could not be loaded</Alert.Title>
        <Alert.Description>
          Retry to manage model access for this credential.
        </Alert.Description>
      </Alert>
      <Button className="w-fit" variant="secondary" onClick={retry}>
        Retry
      </Button>
    </div>
  );
}
