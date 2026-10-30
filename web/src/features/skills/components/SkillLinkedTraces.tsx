import { useState } from "react";
import { type FilterState } from "@langfuse/shared";
import { X } from "@langfuse/icons";
import EventsTable from "@/src/features/events/components/EventsTable";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { TableHeaderControls } from "@/src/components/table/TableHeaderControls";
import { useTableDateRange } from "@/src/hooks/useTableDateRange";
import { rangeToString, type TimeRange } from "@/src/utils/date-range-utils";

export function SkillLinkedTraces({
  projectId,
  name,
  version,
  timeRange: parentTimeRange,
  fileFilter,
}: {
  projectId: string;
  name: string;
  version?: number;
  timeRange?: TimeRange;
  fileFilter?: {
    skillId: string;
    path: string;
    onClear: () => void;
  };
}) {
  const [usage, setUsage] = useState<SkillUsage>("both");
  const selectedUsage = fileFilter ? "loaded" : usage;
  const { timeRange: localTimeRange, setTimeRange } =
    useTableDateRange(projectId);
  const timeRange = parentTimeRange ?? localTimeRange;
  const filters = buildSkillUsageFilters({
    name,
    version,
    usage: selectedUsage,
    fileFilter,
  });

  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-lg border pt-4">
      {!parentTimeRange ? (
        <TableHeaderControls
          timeRange={timeRange}
          setTimeRange={setTimeRange}
        />
      ) : null}
      <Tabs
        value={selectedUsage}
        onValueChange={(value) => {
          if (value === "both" || value === "available" || value === "loaded") {
            setUsage(value);
            if (value !== "loaded") fileFilter?.onClear();
          }
        }}
      >
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h3 className="text-sm font-bold">Observations</h3>
              {fileFilter ? (
                <span className="ph-no-capture max-w-64 min-w-0">
                  <Badge
                    label="File"
                    text={fileFilter.path}
                    trailingIcon={X}
                    color="filled"
                    aria-label={`Clear file filter: ${fileFilter.path}`}
                    onDismiss={() => {
                      setUsage("loaded");
                      fileFilter.onClear();
                    }}
                  />
                </span>
              ) : null}
            </div>
            <Tabs.List
              variant="inset"
              size="sm"
              aria-label="Skill usage filter"
            >
              <Tabs.Trigger
                value="both"
                label="Any"
                tooltip="Observations where this skill was available or loaded"
              />
              <Tabs.Trigger
                value="available"
                label="Available"
                tooltip="Observations offering this skill"
              />
              <Tabs.Trigger
                value="loaded"
                label="Loaded"
                tooltip="Observations loading one or more skill files"
              />
            </Tabs.List>
          </div>
          <Tabs.Content value={selectedUsage}>
            <div className="h-[480px] min-w-0 overflow-hidden">
              <EventsTable
                key={`${name}:${version}:${rangeToString(timeRange)}:${selectedUsage}:${fileFilter?.path ?? ""}`}
                projectId={projectId}
                skill={{ name, version }}
                externalFilterState={filters}
                isolateTableState
                showSearchBar={false}
                showToolbar={false}
                showFilterSidebar={false}
              />
            </div>
          </Tabs.Content>
        </div>
      </Tabs>
    </section>
  );
}

function buildSkillUsageFilters({
  name,
  version,
  usage,
  fileFilter,
}: {
  name: string;
  version: number | undefined;
  usage: SkillUsage;
  fileFilter: { skillId: string; path: string } | undefined;
}): FilterState {
  const column = {
    both: version === undefined ? "skillNames" : "skillVersions",
    available:
      version === undefined ? "skillNamesAvailable" : "skillVersionsAvailable",
    loaded:
      version === undefined ? "skillsNamesLoaded" : "skillsVersionsLoaded",
  }[usage];
  const skillFilters: FilterState = [
    {
      column,
      type: "arrayOptions",
      operator: "any of",
      value: [version === undefined ? name : `${name}@${version}`],
    },
  ];

  return fileFilter
    ? [
        ...skillFilters,
        {
          column: "skillFilesLoaded",
          type: "arrayOptions",
          operator: "any of",
          value: [`${fileFilter.skillId}/${fileFilter.path}`],
        },
      ]
    : skillFilters;
}

type SkillUsage = "both" | "available" | "loaded";
