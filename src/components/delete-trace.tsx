import { TrashIcon } from "lucide-react";
import { useRouter } from "next/router";

import { Button } from "@/src/components/ui/button";
import { api } from "@/src/utils/api";
import { Popover, PopoverContent, PopoverTrigger } from "@/src/components/ui/popover";

export function DeleteTrace({
  traceId,
  projectId,
  isTableAction,
}: {
  traceId: string,
  projectId: string,
  isTableAction?: boolean,
}
) {
  const router = useRouter();
  const utils = api.useContext();

  const onSuccess = async () => {
    await Promise.all([utils.traces.invalidate(), utils.scores.invalidate(), utils.observations.invalidate()]);
  }
  const mutDeleteTrace = api.traces.delete.useMutation({ onSuccess });

  const deleteTrace = async () => {
    await mutDeleteTrace.mutateAsync({traceId, projectId});
    if (!isTableAction) {
      router.push(`/project/${projectId}/traces`);
    }
  };

  return (
    <Popover>
      <PopoverTrigger>
        {isTableAction ? (
          <Button variant="ghost" size="xs">
            <TrashIcon className='w-4 h-4'/>
          </Button>
        ) : (
          <Button
            variant="destructive"
            type="button"
          >
            <TrashIcon className="w-4 h-4 mr-2" />
            Delete
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent>
        <h2 className="text-md font-semibold mb-3">
          Please confirm deletion by clicking the "Delete" button.
        </h2>
        <div className="flex justify-end space-x-4">
          <Button type="button" variant={"destructive"} onClick={deleteTrace}>
            Delete
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
