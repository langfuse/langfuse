import { useArgs } from "storybook/preview-api";
import { fn } from "storybook/test";

import preview from "../../../../../../../.storybook/preview";
import { EvaluatorBackfillSettings } from "./EvaluatorBackfillSettings";

const meta = preview.meta({ component: EvaluatorBackfillSettings });

type EvaluatorBackfillSettingsProps = Parameters<
  typeof EvaluatorBackfillSettings
>[0];

function StatefulEvaluatorBackfillSettings(
  args: EvaluatorBackfillSettingsProps,
) {
  const [, updateArgs] = useArgs<EvaluatorBackfillSettingsProps>();

  return (
    <div className="max-w-xl rounded-md border p-3">
      <EvaluatorBackfillSettings
        {...args}
        onEnabledChange={(enabled) => {
          updateArgs({ enabled });
          args.onEnabledChange(enabled);
        }}
        onWindowChange={(selectedWindow) => {
          updateArgs({ selectedWindow });
          args.onWindowChange(selectedWindow);
        }}
        onRangeChange={(range) => {
          updateArgs({ range });
          args.onRangeChange(range);
        }}
        onMaxItemsChange={(maxItems) => {
          updateArgs({ maxItems });
          args.onMaxItemsChange(maxItems);
        }}
      />
    </div>
  );
}

const sharedArgs: EvaluatorBackfillSettingsProps = {
  enabled: true,
  canEnable: true,
  selectedWindow: "7-days",
  range: {
    from: new Date("2026-08-31T00:00:00"),
    to: new Date("2026-09-07T23:59:59.999"),
  },
  maxItems: 5_000,
  maxAllowedItems: 25_000,
  matchingObservations: 4_400,
  isEstimating: false,
  onEnabledChange: fn(),
  onWindowChange: fn(),
  onRangeChange: fn(),
  onMaxItemsChange: fn(),
};

export const LastSevenDays = meta.story({
  args: sharedArgs,
  render: StatefulEvaluatorBackfillSettings,
});

export const CustomRange = meta.story({
  args: {
    ...sharedArgs,
    selectedWindow: "custom",
    range: {
      from: new Date("2026-08-01T00:00:00"),
      to: new Date("2026-09-07T23:59:59.999"),
    },
    matchingObservations: 21_420,
  },
  render: StatefulEvaluatorBackfillSettings,
});

export const Disabled = meta.story({
  args: {
    ...sharedArgs,
    enabled: false,
  },
  render: StatefulEvaluatorBackfillSettings,
});
