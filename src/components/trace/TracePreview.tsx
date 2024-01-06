import { JSONView } from "@/src/components/ui/code";
import { type Trace, type Score } from "@prisma/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";
import { TraceAggUsageBadge } from "@/src/components/token-usage-badge";
import { Badge } from "@/src/components/ui/badge";
import { type ObservationReturnType } from "@/src/server/api/routers/traces";
import { IOPreview } from "@/src/components/trace/IOPreview";
import { formatInterval } from "@/src/utils/dates";
import { ExpertScoreButton } from "@/src/features/expert-scoring/components";
import Header from "@/src/components/layouts/header";

export const TracePreview = ({
  trace,
  observations,
  ...props
}: {
  trace: Trace & { latency?: number };
  observations: ObservationReturnType[];
  scores: Score[];
}) => {
  const scores = props.scores.filter((s) => s.observationId === null);

  return (
    <Card className="flex-1">
      <CardHeader className="flex flex-row flex-wrap justify-between gap-2">
        <div className="flex flex-col gap-1">
          <CardTitle>
            <span className="mr-2 rounded-sm bg-gray-200 p-1 text-xs">
              TRACE
            </span>
            <span>{trace.name}</span>
          </CardTitle>
          <CardDescription>{trace.timestamp.toLocaleString()}</CardDescription>
          <div className="flex flex-wrap gap-2">
            {!!trace.latency && (
              <Badge variant="outline">{formatInterval(trace.latency)}</Badge>
            )}
            <TraceAggUsageBadge observations={observations} />
            {!!trace.release && (
              <Badge variant="outline">Release: {trace.release}</Badge>
            )}
            {!!trace.version && (
              <Badge variant="outline">Version: {trace.version}</Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <IOPreview
          key={trace.id + "-io"}
          input={trace.input ?? undefined}
          output={trace.output ?? undefined}
        />
        <JSONView
          key={trace.id + "-metadata"}
          title="Metadata"
          json={trace.metadata}
        />
        {trace.tags.length !== 0 && (
          <JSONView key={trace.id + "-tags"} title="Tags" json={trace.tags} />
        )}

        <div className="mt-5 flex flex-col gap-2">
          <Header
            title="Scores"
            level="h3"
            actionButtons={
              <ExpertScoreButton
                projectId={trace.projectId}
                traceId={trace.id}
                scores={scores}
              />
            }
          />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px]">Timestamp</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead>Comment</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {scores.length > 0 ? (
                scores.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="text-xs">
                      {s.timestamp.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-xs">{s.name}</TableCell>
                    <TableCell className="text-xs">{s.type}</TableCell>
                    <TableCell className="text-right text-xs">
                      {s.value}
                    </TableCell>
                    <TableCell className="text-xs">{s.comment}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-xs">
                    No scores
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
      <CardFooter></CardFooter>
    </Card>
  );
};
