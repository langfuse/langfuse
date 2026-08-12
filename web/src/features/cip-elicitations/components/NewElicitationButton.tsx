// CIP fork feature (see FORK.md): creates a draft elicitation and jumps to
// the builder.
import { Button } from "@/src/components/ui/button";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { api } from "@/src/utils/api";
import { Loader2, PlusIcon } from "lucide-react";
import { useRouter } from "next/router";

export function NewElicitationButton({
  projectId,
  variant = "default",
}: {
  projectId: string;
  variant?: "default" | "secondary" | "outline";
}) {
  const router = useRouter();
  const utils = api.useUtils();
  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "elicitations:CUD",
  });
  const create = api.elicitations.create.useMutation({
    onSuccess: async ({ id }) => {
      await utils.elicitations.invalidate();
      await router.push(`/project/${projectId}/elicitations/${id}`);
    },
  });

  return (
    <Button
      variant={variant}
      disabled={!hasAccess || create.isPending}
      onClick={() => create.mutate({ projectId })}
    >
      {create.isPending ? (
        <Loader2 className="mr-1 h-4 w-4 animate-spin" />
      ) : (
        <PlusIcon className="mr-1 h-4 w-4" aria-hidden="true" />
      )}
      New elicitation
    </Button>
  );
}
