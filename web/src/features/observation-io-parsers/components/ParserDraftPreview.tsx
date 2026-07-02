import { useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, CircleDashed } from "lucide-react";
import { Badge } from "@/src/components/ui/badge";
import { Skeleton } from "@/src/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import { api, sendAsPostOption } from "@/src/utils/api";
import { ParsedObservationIoView } from "@/src/features/observation-io-parsers/components/ParsedObservationIoView";
import {
  type ParserDraft,
  type ParserFieldDraft,
} from "@/src/features/observation-io-parsers/lib/parserDraft";
import { type ParserPreviewPointer } from "@/src/features/observation-io-parsers/components/ParserFilterMatches";

const fallbackReasonLabel: Record<string, string> = {
  v4_beta_disabled: "V4 preview is disabled.",
  project_disabled: "Project parsing is disabled.",
  user_disabled: "User parsing is disabled.",
  no_active_configs: "The draft is disabled.",
  event_not_found: "The selected observation was not found.",
  event_too_large: "The selected observation is too large for parser preview.",
  no_matching_config: "The selected observation does not match these filters.",
  parser_error: "The parser failed for this observation.",
  parsed_output_too_large: "The parsed output is too large to preview.",
};

const toFieldInstructions = (fields: ParserFieldDraft[]) =>
  fields.map(({ id: _id, ...field }) => field);

export function ParserDraftPreview({
  projectId,
  draft,
  pointer,
}: {
  projectId: string;
  draft: ParserDraft;
  pointer: ParserPreviewPointer | null;
}) {
  const [view, setView] = useState<"pretty" | "json">("pretty");
  const previewInput = useMemo(
    () => ({
      projectId,
      observation: {
        id: pointer?.observationId ?? "",
        traceId: pointer?.traceId ?? "",
      },
      minStartTime: pointer?.timestamp ?? new Date(0),
      maxStartTime: pointer?.timestamp ?? new Date(0),
      draft: {
        enabled: draft.enabled,
        filters: draft.filters,
        instructions: {
          version: 1 as const,
          sourceRepresentation: draft.sourceRepresentation,
          fields: toFieldInstructions(draft.fields),
        },
      },
    }),
    [
      draft.enabled,
      draft.fields,
      draft.filters,
      draft.sourceRepresentation,
      pointer,
      projectId,
    ],
  );

  const preview = api.observationIoParsers.previewDraft.useQuery(previewInput, {
    ...sendAsPostOption,
    enabled: Boolean(pointer),
    staleTime: 0,
    meta: { silentHttpCodes: [400] },
  });

  if (!pointer) {
    return (
      <div className="text-muted-foreground flex min-h-64 items-center justify-center rounded-md border text-sm">
        Select a matching observation to preview parser output.
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">
            Selected observation
          </div>
          <div className="text-muted-foreground truncate text-xs">
            {pointer.observationId}
          </div>
        </div>
        <Tabs
          className="h-fit shrink-0 px-2 py-0.5"
          value={view}
          onValueChange={(value) => setView(value as "pretty" | "json")}
        >
          <TabsList className="h-fit py-0.5">
            <TabsTrigger value="pretty" className="h-fit px-1 text-xs">
              Formatted
            </TabsTrigger>
            <TabsTrigger value="json" className="h-fit px-1 text-xs">
              JSON
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="min-h-64 flex-1 overflow-auto rounded-md border">
        {preview.isLoading ? (
          <div className="space-y-3 p-3">
            <Skeleton className="h-8 w-1/3" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : preview.isError ? (
          <div className="text-muted-foreground flex min-h-64 items-center justify-center p-4 text-center text-sm">
            {preview.error.message}
          </div>
        ) : preview.data?.mode === "parsed" ? (
          <ParsedObservationIoView
            parsedObservationIo={preview.data}
            projectId={projectId}
            traceId={pointer.traceId}
            currentView={view}
          />
        ) : (
          <div className="text-muted-foreground flex min-h-64 items-center justify-center p-4 text-center text-sm">
            {preview.data
              ? (fallbackReasonLabel[preview.data.reason] ??
                "Parser preview is unavailable.")
              : "Parser preview is unavailable."}
          </div>
        )}
      </div>

      {preview.data?.mode === "parsed" && (
        <div className="rounded-md border p-2">
          <div className="mb-2 text-xs font-medium">Field status</div>
          <div className="flex flex-wrap gap-1.5">
            {preview.data.fields.map((field) => (
              <Badge
                key={`${field.source}-${field.key}`}
                variant={field.status === "ok" ? "success" : "secondary"}
                size="sm"
                className="gap-1"
              >
                {field.status === "ok" ? (
                  <CheckCircle2 className="h-3 w-3" />
                ) : field.status === "miss" ? (
                  <CircleDashed className="h-3 w-3" />
                ) : (
                  <AlertCircle className="h-3 w-3" />
                )}
                {field.label}: {field.status}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
