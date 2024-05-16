import {
  Table,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  TableHead,
} from "@/src/components/ui/table";
import { type Score } from "@langfuse/shared";

export const ScoresTablePreview = ({ scores }: { scores: Score[] }) => {
  return (
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
          {scores.map((s) => (
            <TableRow key={s.id}>
              <TableCell className="text-xs">
                {s.timestamp.toLocaleString()}
              </TableCell>
              <TableCell className="text-xs">{s.name}</TableCell>
              <TableCell className="text-right text-xs">{s.value}</TableCell>
              <TableCell className="text-xs">{s.comment}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};
