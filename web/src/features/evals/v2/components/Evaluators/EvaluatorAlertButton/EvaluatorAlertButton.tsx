import { useRouter } from "next/router";
import {
  ArrowUpRight,
  Bell,
  ChevronDown,
  DollarSign,
  Gauge,
  LoaderCircle,
  Plus,
} from "lucide-react";

import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/src/components/ui/command";
import { PopoverController } from "@/src/components/ui/popover";
import {
  evaluatorAlertsListUrl,
  evaluatorAlertUrl,
} from "@/src/features/evals/v2/fns/evaluators/evaluatorAlertUrl";
import { MonitorSeverityBadge } from "@/src/features/monitors";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { renderEvaluatorAlertLastFired } from "@/src/features/evals/v2/fns/evaluators/renderEvaluatorAlertLastFired";
import { renderEvaluatorAlertTriggerCondition } from "@/src/features/evals/v2/fns/evaluators/renderEvaluatorAlertTriggerCondition";
import type { RouterOutputs } from "@/src/utils/api";

type ConnectedAlert =
  RouterOutputs["monitors"]["linkedEvaluatorAlerts"]["data"][number];

type EvaluatorAlertButtonProps = {
  projectId: string;
  connectedAlerts: ConnectedAlert[];
  hasMore?: boolean;
  isLoading?: boolean;
  canRead: boolean;
  canCreate: boolean;
  limitReached?: boolean;
} & (
  | {
      scope: "evaluator";
      evaluatorId: string;
      evaluatorType: "LLM_AS_JUDGE" | "CODE";
      scoreDataType?: "NUMERIC" | "BOOLEAN" | "CATEGORICAL";
    }
  | { scope: "allEvaluators" }
);

/** Alert picker for one evaluator or aggregate evaluator cost. */
export function EvaluatorAlertButton(props: EvaluatorAlertButtonProps) {
  const {
    projectId,
    connectedAlerts,
    hasMore = false,
    isLoading = false,
    canRead,
    canCreate,
    limitReached = false,
  } = props;
  const router = useRouter();
  const capture = usePostHogClientCapture();
  const createDisabled = !canCreate || limitReached;
  const disabledReason = limitReached
    ? "Alert limit reached"
    : "You do not have permission to create alerts";
  const alertCount = connectedAlerts.length;
  const isAggregateCost = props.scope === "allEvaluators";
  const supportsCostAlert =
    isAggregateCost ||
    (props.scope === "evaluator" && props.evaluatorType === "LLM_AS_JUDGE");
  const scoreAlertUrl = (dataType: "NUMERIC" | "BOOLEAN" | "CATEGORICAL") => {
    if (props.scope !== "evaluator") return "";
    return evaluatorAlertUrl(projectId, {
      type: "score",
      evaluatorId: props.evaluatorId,
      scoreDataType: dataType,
    });
  };
  const costAlertUrl = evaluatorAlertUrl(
    projectId,
    isAggregateCost
      ? { type: "allEvaluatorCost" }
      : { type: "cost", evaluatorId: props.evaluatorId },
  );
  const selectedScoreDataType =
    props.scope === "evaluator" ? props.scoreDataType : undefined;
  const navigate = (href: string, closePopover: () => void) => {
    closePopover();
    router.push(href).catch(() => undefined);
  };
  const openAlertCreation = (
    alertType: "score" | "cost" | "all_evaluator_cost",
    href: string,
    closePopover: () => void,
    dataType?: "NUMERIC" | "BOOLEAN" | "CATEGORICAL",
  ) => {
    capture("evaluators:alert_create_clicked", {
      source: isAggregateCost ? "evaluator_overview" : "evaluator_detail",
      alertType,
      scoreDataType: dataType,
    });
    navigate(href, closePopover);
  };

  return (
    <PopoverController
      align="end"
      contentClassName="w-96 p-0"
      disabled={false}
      modal={false}
      renderContent={({ closePopover }) => (
        <Command defaultValue="__none__">
          <CommandList>
            {canRead && connectedAlerts.length > 0 ? (
              <div className="p-2">
                <p className="text-muted-foreground px-2 py-1.5 text-[10px] font-bold tracking-wider uppercase">
                  Connected · {connectedAlerts.length}
                  {hasMore ? "+" : ""}
                </p>
                <div className="space-y-1">
                  {connectedAlerts.map((alert) => (
                    <CommandItem
                      key={alert.id}
                      value={`connected ${alert.name} ${alert.id}`}
                      className="items-start rounded-md px-3 py-2.5"
                      onSelect={() =>
                        navigate(
                          `/project/${projectId}/alerts/${alert.id}`,
                          closePopover,
                        )
                      }
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-bold" title={alert.name}>
                          {alert.name}
                        </p>
                        <p className="text-muted-foreground mt-0.5 text-xs">
                          {renderEvaluatorAlertTriggerCondition(alert)}
                          <span className="px-1" aria-hidden="true">
                            ·
                          </span>
                          {renderEvaluatorAlertLastFired(alert.alertedAt)}
                        </p>
                      </div>
                      <MonitorSeverityBadge
                        severity={alert.severity}
                        className="ml-auto w-auto shrink-0 px-2 py-0.5 text-[10px]"
                      />
                      <ArrowUpRight className="text-muted-foreground h-4 w-4 shrink-0" />
                    </CommandItem>
                  ))}
                </div>
                {hasMore ? (
                  <CommandItem
                    value="see all alerts"
                    className="mt-1"
                    onSelect={() =>
                      navigate(
                        evaluatorAlertsListUrl(
                          projectId,
                          props.scope === "evaluator"
                            ? props.evaluatorId
                            : undefined,
                        ),
                        closePopover,
                      )
                    }
                  >
                    <span>See all alerts</span>
                    <ArrowUpRight className="text-muted-foreground ml-auto h-4 w-4 shrink-0" />
                  </CommandItem>
                ) : null}
              </div>
            ) : (
              <div className="px-4 py-3">
                <p className="text-sm font-bold">
                  {isAggregateCost
                    ? "No alerts on evaluator cost"
                    : "No alerts on this evaluator"}
                </p>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  {isAggregateCost
                    ? "Get notified when evaluator cost crosses a threshold."
                    : supportsCostAlert
                      ? "Get notified when this evaluator's scores or cost cross a threshold."
                      : "Get notified when this evaluator's score crosses a threshold."}
                </p>
              </div>
            )}
            <CommandSeparator className="mx-0" />
            {connectedAlerts.length > 0 ? (
              <div className="flex items-center justify-between gap-3 p-2">
                <span className="text-muted-foreground flex h-8 items-center px-1 text-sm leading-none">
                  Add alert
                </span>
                <div className="flex flex-wrap items-center justify-end gap-1.5">
                  {selectedScoreDataType ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 cursor-pointer gap-1.5"
                      disabled={createDisabled}
                      onClick={() =>
                        openAlertCreation(
                          "score",
                          scoreAlertUrl(selectedScoreDataType),
                          closePopover,
                          selectedScoreDataType,
                        )
                      }
                    >
                      <Gauge className="text-muted-foreground h-4 w-4" />
                      Score
                    </Button>
                  ) : null}
                  {supportsCostAlert ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 cursor-pointer gap-1.5"
                      disabled={createDisabled}
                      onClick={() =>
                        openAlertCreation(
                          isAggregateCost ? "all_evaluator_cost" : "cost",
                          costAlertUrl,
                          closePopover,
                        )
                      }
                    >
                      <DollarSign className="text-muted-foreground h-4 w-4" />
                      Cost
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : (
              <CommandGroup>
                {selectedScoreDataType ? (
                  <CommandItem
                    disabled={createDisabled}
                    onSelect={() =>
                      openAlertCreation(
                        "score",
                        scoreAlertUrl(selectedScoreDataType),
                        closePopover,
                        selectedScoreDataType,
                      )
                    }
                  >
                    <Gauge className="text-muted-foreground" />
                    <div>
                      <p>Score threshold</p>
                      <p className="text-muted-foreground text-xs">
                        Alert when this evaluator&apos;s score crosses a
                        threshold
                      </p>
                    </div>
                    <ArrowUpRight className="text-muted-foreground ml-auto h-4 w-4 shrink-0" />
                  </CommandItem>
                ) : null}
                {supportsCostAlert ? (
                  <CommandItem
                    disabled={createDisabled}
                    onSelect={() =>
                      openAlertCreation(
                        isAggregateCost ? "all_evaluator_cost" : "cost",
                        costAlertUrl,
                        closePopover,
                      )
                    }
                  >
                    <DollarSign className="text-muted-foreground" />
                    <div>
                      <p>Cost threshold</p>
                      <p className="text-muted-foreground text-xs">
                        {isAggregateCost
                          ? "Alert when evaluator cost crosses a threshold"
                          : "Alert on spend from running this evaluator"}
                      </p>
                    </div>
                    <ArrowUpRight className="text-muted-foreground ml-auto h-4 w-4 shrink-0" />
                  </CommandItem>
                ) : null}
              </CommandGroup>
            )}
            {createDisabled ? (
              <p className="text-muted-foreground px-3 pb-2 text-xs">
                {disabledReason}
              </p>
            ) : null}
          </CommandList>
        </Command>
      )}
    >
      {({ Trigger }) => (
        <Trigger asChild>
          <Button
            type="button"
            variant="outline"
            aria-label={
              isLoading
                ? "Loading evaluator alerts"
                : alertCount > 0
                  ? `${alertCount} connected evaluator alert${alertCount === 1 ? "" : "s"}`
                  : "Add evaluator alert"
            }
            className="w-auto max-w-full justify-start"
          >
            {isLoading ? (
              <LoaderCircle
                className="mr-1 h-4 w-4 shrink-0 animate-spin"
                aria-hidden="true"
              />
            ) : alertCount > 0 ? (
              <Bell className="mr-1 h-4 w-4 shrink-0" aria-hidden="true" />
            ) : (
              <Plus className="mr-1 h-4 w-4 shrink-0" aria-hidden="true" />
            )}
            <span className="flex-1 text-left">
              {alertCount > 0 ? "Alerts" : "Add alert"}
            </span>
            {!isLoading && alertCount > 0 ? (
              <Badge variant="secondary" size="sm" className="ml-1 shrink-0">
                {alertCount}
              </Badge>
            ) : null}
            <ChevronDown className="ml-1 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </Trigger>
      )}
    </PopoverController>
  );
}
