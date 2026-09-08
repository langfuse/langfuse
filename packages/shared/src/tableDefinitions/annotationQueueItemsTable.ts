import { AnnotationQueueStatus } from "@prisma/client";
import { ColumnDefinition } from "./types";

// Keep these on annotation_queue_items (aqi). The count query in
// itemsByQueueId does not join the users table, so a u.* column would
// break it.
export const annotationQueueItemsTableCols: ColumnDefinition[] = [
  {
    name: "Status",
    id: "status",
    type: "stringOptions",
    internal: 'aqi."status"::text',
    options: Object.values(AnnotationQueueStatus).map((value) => ({ value })),
  },
  {
    name: "Created At",
    id: "createdAt",
    type: "datetime",
    internal: 'aqi."created_at"',
  },
  {
    name: "Completed At",
    id: "completedAt",
    type: "datetime",
    internal: 'aqi."completed_at"',
    nullable: true,
  },
];
