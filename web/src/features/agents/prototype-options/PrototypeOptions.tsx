import { SlidersHorizontal, RotateCcw } from "lucide-react";
import { PopoverController } from "@/src/components/ui/popover";
import { Button } from "@/src/components/design-system/Button/Button";
import { Checkbox } from "@/src/components/design-system/Checkbox/Checkbox";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import { SwitchInput } from "@/src/components/design-system/SwitchInput/SwitchInput";
import { CARD_METRICS } from "./options";
import { useAgentsPrototypeOptions } from "./useAgentsPrototypeOptions";

export function PrototypeOptions({ projectId }: { projectId: string }) {
  const { options, setOptions, resetOptions } =
    useAgentsPrototypeOptions(projectId);
  return (
    <PopoverController
      align="end"
      contentClassName="w-[min(20rem,calc(100vw-2rem))] p-4"
      disabled={false}
      modal={false}
      renderContent={() => (
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="text-sm font-bold">Prototype options</h2>
            <p className="text-muted-foreground mt-1 text-xs">
              Compare directions for the Agents experience. Choices are included
              in this URL and remembered in this browser.
            </p>
          </div>
          <label className="flex flex-col gap-1.5 text-xs">
            Agent details chart
            <SelectInput
              placeholder="Agent details chart"
              value={options.profileChart}
              onValueChange={(profileChart) => setOptions({ profileChart })}
              options={[
                { value: "contextual", label: "Changes with the tab" },
                { value: "pulse", label: "Fixed invocation Pulse" },
                { value: "none", label: "No chart" },
              ]}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs">
            Comparison baseline
            <SelectInput
              placeholder="Baseline"
              value={String(options.baselineDays)}
              onValueChange={(value) =>
                setOptions({ baselineDays: value === "7" ? 7 : 14 })
              }
              options={[
                { value: "7", label: "Previous 7 days" },
                { value: "14", label: "Previous 14 days" },
              ]}
            />
          </label>
          <fieldset>
            <legend className="mb-2 text-xs font-bold">Card metrics</legend>
            <div className="grid grid-cols-2 gap-2">
              {CARD_METRICS.map((metric) => (
                <label
                  key={metric}
                  className="flex items-center gap-2 text-xs capitalize"
                >
                  <Checkbox
                    checked={options.cardMetrics.includes(metric)}
                    disabled={
                      options.cardMetrics.length === 1 &&
                      options.cardMetrics.includes(metric)
                    }
                    onCheckedChange={(checked) =>
                      setOptions({
                        cardMetrics: checked
                          ? [...options.cardMetrics, metric]
                          : options.cardMetrics.filter(
                              (value) => value !== metric,
                            ),
                      })
                    }
                  />
                  {metric}
                </label>
              ))}
            </div>
          </fieldset>
          <SwitchInput
            id="agents-attention"
            description="Show changes and outlier suggestions"
            checked={options.showAttention}
            onCheckedChange={(showAttention) => setOptions({ showAttention })}
          />
          <SwitchInput
            id="agents-identity-badges"
            description="Preview identity badges in session details"
            checked={options.showIdentityBadges}
            onCheckedChange={(showIdentityBadges) =>
              setOptions({ showIdentityBadges })
            }
          />
          <Button
            text="Reset prototype options"
            icon={RotateCcw}
            variant="secondary"
            onClick={resetOptions}
          />
        </div>
      )}
    >
      {({ Trigger }) => (
        <Trigger asChild>
          <Button
            text="Prototype options"
            icon={SlidersHorizontal}
            variant="secondary"
          />
        </Trigger>
      )}
    </PopoverController>
  );
}
