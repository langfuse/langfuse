import { Badge } from "@/src/components/design-system/Badge/Badge";
import { CustomTooltip } from "@/src/components/design-system/CustomTooltip/CustomTooltip";
import { EmptyValue } from "@/src/components/design-system/table/components/EmptyValue/EmptyValue";
import { SingleLineOverflowList } from "@/src/components/SingleLineOverflowList";
import type { ApiFormat } from "@/src/features/ai-gateway/fns/getGatewayModelApiFormats";

const apiFormatLabels = {
  "Anthropic Messages": "Messages",
  "OpenAI Chat Completions": "Completions",
  "OpenAI Responses": "Responses",
} satisfies Record<ApiFormat, string>;

export type GatewayRoutesCellProps = {
  apiFormats: ApiFormat[];
};

/** Routes that do not fit on one line collapse into a "+N" badge. */
export function GatewayRoutesCell({ apiFormats }: GatewayRoutesCellProps) {
  if (apiFormats.length === 0) return <EmptyValue />;

  return (
    <SingleLineOverflowList
      items={apiFormats}
      additionalOverflowCount={0}
      getKey={getApiFormatKey}
      renderItem={renderRouteBadge}
      renderOverflow={renderOverflowBadge}
    />
  );
}

function RouteBadge({ text }: { text: string }) {
  return <Badge color="filled" size="md" text={text} title={text} />;
}

function OverflowBadge({
  hiddenItems,
  overflowItemCount,
}: {
  hiddenItems: readonly ApiFormat[];
  overflowItemCount: number;
}) {
  return (
    <CustomTooltip
      content={
        <div className="flex flex-wrap gap-1">
          {hiddenItems.map(renderRouteBadge)}
        </div>
      }
    >
      {({ getTriggerProps }) => (
        <span {...getTriggerProps()} className="inline-flex" tabIndex={0}>
          <RouteBadge text={`+${overflowItemCount}`} />
        </span>
      )}
    </CustomTooltip>
  );
}

function getApiFormatKey(apiFormat: ApiFormat) {
  return apiFormat;
}

function renderRouteBadge(apiFormat: ApiFormat) {
  return <RouteBadge key={apiFormat} text={apiFormatLabels[apiFormat]} />;
}

function renderOverflowBadge(props: Parameters<typeof OverflowBadge>[0]) {
  return <OverflowBadge {...props} />;
}
