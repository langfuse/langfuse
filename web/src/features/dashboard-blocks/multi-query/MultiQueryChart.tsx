import { type MultiQueryConfig } from "@langfuse/shared";
import { type DataCardActions } from "@/src/components/design-system/DataCard/DataCard";
import {
  useMultiQueryWidget,
  type MultiQueryWidgetContext,
} from "./useMultiQueryWidget";
import { MultiQueryResultView } from "./MultiQueryResultView";

export function MultiQueryChart(
  props: MultiQueryWidgetContext & {
    config: MultiQueryConfig;
    actions?: DataCardActions;
  },
) {
  const runtime = useMultiQueryWidget(props.config, props, true);
  return (
    <MultiQueryResultView
      config={props.config}
      runtime={runtime}
      actions={props.actions}
    />
  );
}
