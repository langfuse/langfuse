import { Badge } from "@/src/components/design-system/Badge/Badge";

type GatewayApiKeyModelsCellProps = {
  /** Null allows every model the admin enabled. */
  patterns: string[] | null;
};

export function GatewayApiKeyModelsCell({
  patterns,
}: GatewayApiKeyModelsCellProps) {
  const [first, ...rest] = patterns ?? [];
  if (first === undefined) {
    return <span className="text-muted-foreground">All models</span>;
  }

  return (
    <span className="ph-no-capture flex min-w-0 items-center gap-1">
      <Badge color="filled" size="md" text={first} />
      {rest.length > 0 ? (
        <Badge
          color="filled"
          size="md"
          text={`+${rest.length}`}
          title={rest.join(", ")}
        />
      ) : null}
    </span>
  );
}
