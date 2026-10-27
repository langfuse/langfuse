import { ExternalLink } from "@langfuse/icons";
import { type AnnotationQueueDisplayColumn } from "@langfuse/shared";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { TextLink } from "@/src/components/design-system/TextLink/TextLink";
import { formatQueueTraceField } from "@/src/features/annotation-queues/lib/queueTraceColumns";

/** A queue trace column's value, shown in the column's format. */
export function QueueTraceFieldCell({
  value,
  format,
}: {
  value: string;
  format: AnnotationQueueDisplayColumn["format"];
}) {
  const formatted = formatQueueTraceField(value, format);
  switch (formatted.kind) {
    case "link":
      return (
        <TextLink
          path={formatted.href}
          value={formatted.text}
          icon={ExternalLink}
          external
        />
      );
    case "badge":
      return (
        <span className="ph-no-capture inline-flex max-w-full" title={value}>
          <Badge size="md" color={formatted.color} text={formatted.text} />
        </span>
      );
    case "text":
      return (
        <span
          className="ph-no-capture block w-full truncate"
          title={formatted.title}
        >
          {formatted.text}
        </span>
      );
  }
}
