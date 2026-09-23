import { Alert } from "@/src/components/design-system/Alert/Alert";
import { api } from "@/src/utils/api";
import { JSONView } from "@/src/components/ui/CodeJsonViewer";

export function SummaryInspector({
  projectId,
  summaryId,
}: {
  projectId: string;
  summaryId: string;
}) {
  const query = api.topics.inspect.useQuery({
    projectId,
    summaryId,
  });
  if (query.error)
    return (
      <Alert variant="destructive" size="sm">
        <Alert.Description>
          <p className="break-words">{query.error.message}</p>
        </Alert.Description>
      </Alert>
    );
  if (!query.data) return <p className="text-xs">Loading transcript…</p>;
  const transcript = query.data.text;
  const projectionDescription = transcript
    ? "Current transcript regenerated from trace data. It may differ from the summarized input."
    : "Source transcript unavailable. The stored summary is still retained.";
  return (
    <div className="flex flex-col gap-2">
      <p className="text-muted-foreground text-xs break-all">
        {query.data.model}
      </p>
      <p className="text-muted-foreground text-xs">{projectionDescription}</p>
      {transcript && (
        <JSONView
          title="Transcript"
          json={JSON.parse(transcript)}
          preserveStrings
        />
      )}
    </div>
  );
}
