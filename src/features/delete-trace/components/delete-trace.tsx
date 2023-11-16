import { TrashIcon } from "lucide-react";
import { useRouter } from "next/router";

import { Button } from "@/src/components/ui/button";
import { api } from "@/src/utils/api";

export function DeleteTrace({
  traceId,
  projectId,
  icon,
}: {
  traceId: string,
  projectId: string,
  icon?: boolean,
}
) {
  const router = useRouter();

  const mutDeleteTrace = api.traces.delete.useMutation();

  const deleteTrace = async () => {
    await mutDeleteTrace.mutateAsync({traceId: traceId});
    if (icon) {
      router.reload();
    } else {
      router.push(`/project/${projectId}/traces`);
    }
  };

  if (icon) {
    return (
      <Button variant="ghost" size="xs" onClick={deleteTrace}>
        <TrashIcon className='w-4 h-4'/>
      </Button>
    );
  };

  return (
    <Button
      variant="destructive"
      type="button"
      onClick={deleteTrace}
    >
      <TrashIcon className="w-4 h-4 mr-2" />
      Delete
    </Button>
  );
}
