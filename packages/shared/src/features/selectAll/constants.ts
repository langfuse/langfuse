export const ACTION_ACCESS_MAP = {
  "trace-delete": {
    scope: "traces:delete" as const,
    entitlement: "trace-deletion" as const,
    type: "delete" as const,
  },
  "trace-add-to-annotation-queue": {
    scope: "annotationQueues:CUD" as const,
    entitlement: "annotation-queues" as const,
    type: "create" as const,
  },
} as const;
