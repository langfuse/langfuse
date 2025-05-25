import React from "react";
import { ListTodo } from "lucide-react";
import { api } from "@/src/utils/api";
import TableLink from "@/src/components/table/table-link";

interface AnnotationQueueActionConfigProps {
  projectId: string;
  config: {
    type: "ANNOTATION_QUEUE";
    queueId: string;
  };
}

export const AnnotationQueueActionConfig: React.FC<
  AnnotationQueueActionConfigProps
> = ({ projectId, config }) => {
  // Fetch annotation queue details
  const { data: annotationQueue } = api.annotationQueues.byId.useQuery(
    {
      projectId,
      queueId: config.queueId,
    },
    {
      enabled: !!config.queueId,
    },
  );

  return (
    <div className="space-y-3">
      <div>
        <h5 className="flex items-center gap-2 text-sm font-medium">
          <ListTodo className="h-4 w-4" />
          Queue
        </h5>
        <TableLink
          path={`/project/${projectId}/annotation-queues/${config.queueId}`}
          value={annotationQueue?.name || "Unknown Queue"}
        />
      </div>
      {annotationQueue?.description && (
        <div>
          <h5 className="text-sm font-medium">Description</h5>
          <p className="text-sm text-muted-foreground">
            {annotationQueue.description}
          </p>
        </div>
      )}
    </div>
  );
};
