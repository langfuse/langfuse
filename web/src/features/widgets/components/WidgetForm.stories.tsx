import { useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";
import { fn } from "storybook/test";
import preview from "../../../../.storybook/preview";
import { WidgetForm } from "./WidgetForm";
import { toDefaultValues, type WidgetFormValues } from "./widgetFormSchema";

function WidgetFormFixture({ invalidQuery }: { invalidQuery: boolean }) {
  const form = useForm<WidgetFormValues>({
    defaultValues: toDefaultValues(
      {
        name: "Observation count",
        description: "Observations over time",
        view: "observations",
        measure: "count",
        aggregation: "count",
        dimension: "none",
        chartType: "LINE_TIME_SERIES",
        filters: [],
      },
      "v1",
    ),
    mode: "onChange",
  });
  const values = useWatch({ control: form.control }) as WidgetFormValues;

  useEffect(() => {
    void form.trigger();
  }, [form.trigger]);

  return (
    <div className="h-[700px] w-[480px]">
      <WidgetForm
        form={form}
        values={values}
        queryValidation={
          invalidQuery
            ? { valid: false, reason: "Choose a supported filter." }
            : { valid: true }
        }
        onSave={fn()}
        baseMinVersion={1}
        activeVersion="v1"
        projectId="storybook-project"
        widgetId="storybook-widget"
        isV4={false}
        viewVersion="v1"
        dateRange={undefined}
        suggestions={{
          name: "Observation count",
          description: "Observations over time",
        }}
        setDateRangeAndOption={() => {}}
        selectedOption="last7Days"
        filterData={{
          columns: [],
          columnsWithCustomSelect: [],
          stringObjectValueOptions: undefined,
          onStringObjectKeyChange: undefined,
        }}
      />
    </div>
  );
}

const meta = preview.meta({ component: WidgetForm });

export const Default = meta.story({
  render: () => <WidgetFormFixture invalidQuery={false} />,
});

export const InvalidQuery = meta.story({
  render: () => <WidgetFormFixture invalidQuery={true} />,
});
