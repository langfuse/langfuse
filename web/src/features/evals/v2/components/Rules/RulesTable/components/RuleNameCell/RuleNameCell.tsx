import { Badge } from "@/src/components/ui/badge";

export function RuleNameCell({
  name,
  legacy,
}: {
  name: string;
  legacy: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="block truncate font-bold" title={name}>
        {name}
      </span>
      {legacy ? <Badge variant="warning">Legacy</Badge> : null}
    </div>
  );
}
