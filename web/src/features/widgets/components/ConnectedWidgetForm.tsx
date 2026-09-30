import { ConnectedWidgetPreview } from "./ConnectedWidgetPreview";
import { WidgetForm, useWidgetFormState } from "./WidgetForm";
import { useMetricsFilterBuilderData } from "@/src/features/metrics/components/ConnectedMetricsFilterBuilder";
import {
  type WidgetInitialValues,
  type WidgetSavePayload,
} from "./widgetFormSchema";

export function ConnectedWidgetForm(props: {
  initialValues: WidgetInitialValues;
  projectId: string;
  onSave: (widgetData: WidgetSavePayload) => void;
  widgetId?: string;
}) {
  const formProps = useWidgetFormState(props);
  const filterData = useMetricsFilterBuilderData({
    version: formProps.viewVersion,
    view: formProps.values.view,
    projectId: props.projectId,
    dateRange: formProps.dateRange,
    filters: formProps.values.filters,
  });
  return (
    <div className="flex h-full gap-4">
      <div className="h-full w-1/3 min-w-[430px]">
        <WidgetForm {...formProps} filterData={filterData} />
      </div>
      <ConnectedWidgetPreview {...formProps} />
    </div>
  );
}
