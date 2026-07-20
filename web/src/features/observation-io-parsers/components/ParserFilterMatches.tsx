import { useEffect, useMemo } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { type FilterState } from "@langfuse/shared";
import { Badge } from "@/src/components/ui/badge";
import { LocalIsoDate } from "@/src/components/LocalIsoDate";
import { api, sendAsPostOption, type RouterOutputs } from "@/src/utils/api";
import { cn } from "@/src/utils/tailwind";

const SAMPLE_LIMIT = 10;
const SAMPLE_LOOKBACK_MS = 24 * 60 * 60 * 1000;

type ParserObservationSample =
  RouterOutputs["events"]["all"]["observations"][number];

const EMPTY_SAMPLES: ParserObservationSample[] = [];

export type ParserPreviewPointer = {
  observationId: string;
  traceId: string;
  timestamp: Date;
  name: string | null;
  type: string | null;
  traceName: string | null;
};

export const getParserPreviewPointerFromSample = (
  sample: ParserObservationSample,
): ParserPreviewPointer | null => {
  if (!sample.traceId || !sample.startTime) return null;

  return {
    observationId: sample.id,
    traceId: sample.traceId,
    timestamp: sample.startTime,
    name: sample.name ?? null,
    type: sample.type ?? null,
    traceName: sample.traceName ?? null,
  };
};

const getSampleTitle = (sample: ParserObservationSample) =>
  sample.name || sample.traceName || sample.id;

export function ParserFilterMatches({
  projectId,
  filters,
  selectedObservationId,
  onPointersChange,
  onSelect,
}: {
  projectId: string;
  filters: FilterState;
  selectedObservationId?: string | null;
  onPointersChange: (pointers: ParserPreviewPointer[]) => void;
  onSelect: (pointer: ParserPreviewPointer) => void;
}) {
  const sampleStartTime = useMemo(
    () => new Date(Date.now() - SAMPLE_LOOKBACK_MS),
    [],
  );
  const sampleFilters = useMemo<FilterState>(
    () => [
      ...filters,
      {
        column: "startTime",
        type: "datetime",
        operator: ">=",
        value: sampleStartTime,
      },
    ],
    [filters, sampleStartTime],
  );
  const samplesQuery = api.events.all.useQuery(
    {
      projectId,
      filter: sampleFilters,
      searchQuery: null,
      searchType: ["id", "content"],
      orderBy: { column: "startTime", order: "DESC" },
      page: 1,
      limit: SAMPLE_LIMIT,
    },
    {
      ...sendAsPostOption,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
      meta: { silentHttpCodes: [422] },
    },
  );

  const samples = samplesQuery.data?.observations ?? EMPTY_SAMPLES;
  const pointers = useMemo(
    () =>
      samples
        .map(getParserPreviewPointerFromSample)
        .filter((pointer): pointer is ParserPreviewPointer => Boolean(pointer)),
    [samples],
  );

  useEffect(() => {
    onPointersChange(pointers);
  }, [onPointersChange, pointers]);

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div>
        <div className="text-sm font-medium">Matching observations</div>
        <div className="text-muted-foreground text-xs">
          Sample over the last 24 hours that match filters
        </div>
      </div>
      <div className="flex min-h-[14rem] flex-col overflow-hidden rounded-md border">
        {samplesQuery.isLoading ? (
          <div className="text-muted-foreground flex min-h-40 items-center justify-center gap-2 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading samples
          </div>
        ) : samplesQuery.isError ? (
          <div className="text-muted-foreground flex min-h-40 items-center justify-center gap-2 p-4 text-center text-sm">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {samplesQuery.error.message}
          </div>
        ) : pointers.length === 0 ? (
          <div className="text-muted-foreground flex min-h-40 items-center justify-center p-4 text-center text-sm">
            No observations matched these filters in the last 24 hours.
          </div>
        ) : (
          <div className="min-h-0 overflow-auto">
            {samples.map((sample) => {
              const pointer = getParserPreviewPointerFromSample(sample);
              if (!pointer) return null;

              const selected = sample.id === selectedObservationId;

              return (
                <button
                  key={sample.id}
                  type="button"
                  className={cn(
                    "hover:bg-muted/60 grid w-full gap-1 border-b px-3 py-2 text-left text-sm last:border-b-0",
                    selected && "bg-muted",
                  )}
                  onClick={() => onSelect(pointer)}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    {sample.type ? (
                      <Badge variant="secondary" size="sm">
                        {sample.type}
                      </Badge>
                    ) : null}
                    <span className="truncate font-medium">
                      {getSampleTitle(sample)}
                    </span>
                  </div>
                  <div className="text-muted-foreground flex min-w-0 items-center gap-2 text-xs">
                    <LocalIsoDate date={sample.startTime} />
                    {sample.traceName ? (
                      <>
                        <span aria-hidden="true">/</span>
                        <span className="truncate">{sample.traceName}</span>
                      </>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
