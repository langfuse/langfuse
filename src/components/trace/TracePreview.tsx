import { JSONView } from "@/src/components/ui/code";
import { type Trace, type Observation, type Score } from "@prisma/client";
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
import { ManualScoreButton } from "@/src/features/manualScoring/components";

export const TracePreview = ({
  trace,
  observations,
  scores,
  projectId,
}: {
  trace: Trace;
  observations: Observation[];
  scores: Score[];
  projectId: string;
}) => {
  return (
    <Card className="flex-1">
      <CardHeader className="flex items-start sm:flex-row sm:justify-between">
        <div>
          <CardTitle>
            <span className="mr-2 rounded-sm bg-gray-200 p-1 text-xs">
              TRACE
            </span>
            <span>{trace.name}</span>
          </CardTitle>
          <CardDescription>{trace.timestamp.toLocaleString()}</CardDescription>
          <div className="flex flex-wrap gap-2">
            <TraceAggUsageBadge observations={observations} />
          </div>
        </div>
        <ManualScoreButton
          projectId={projectId}
          traceId={trace.id}
          scores={scores}
        />
      </CardHeader>
      <CardContent>
        <JSONView title="Metadata" json={trace.metadata} scrollable />
        {scores.find((s) => s.observationId === null) ? (
          <div className="mt-5 flex flex-col gap-2">
            <h3>Scores</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">Timestamp</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead>Comment</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scores
                  .filter((s) => s.observationId === null)
                  .map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="text-xs">
                        {s.timestamp.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-xs">{s.name}</TableCell>
                      <TableCell className="text-right text-xs">
                        {s.value}
                      </TableCell>
                      <TableCell className="text-xs">{s.comment}</TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        ) : null}
      </CardContent>
      <CardFooter></CardFooter>
    </Card>
  );
};
