import { Button } from "@/src/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import { Input } from "@/src/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { FilterBuilder } from "@/src/features/filters/components/filter-builder";
import { type FilterState } from "@/src/features/filters/types";
import {
  aggregationRawStrings,
  sqlInterface,
  type aggregations,
} from "@/src/server/api/services/sqlInterface";
import { tableDefinitions } from "@/src/server/api/services/tableDefinitions";
import { api } from "@/src/utils/api";
import { utcDateOffsetByDays } from "@/src/utils/dates";
import { zodResolver } from "@hookform/resolvers/zod";
import { usePostHog } from "posthog-js/react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";

const formSchema = z.object({
  name: z.string(),
  query: sqlInterface,
});

export const NewChartForm = (props: {
  projectId: string;
  onFormSuccess?: () => void;
}) => {
  const [formError, setFormError] = useState<string | null>(null);
  const [selectState, setSelectState] = useState<{
    column: string;
    agg: z.infer<typeof aggregations>;
  }>({
    column: "totalTokens",
    agg: "AVG",
  });
  const [filterState, setFilterState] = useState<FilterState>([
    {
      column: "start_time",
      type: "datetime",
      operator: ">",
      value: utcDateOffsetByDays(-14),
    },
  ]);

  const posthog = usePostHog();
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
    },
  });

  // const utils = api.useUtils();

  function onSubmit(values: z.infer<typeof formSchema>) {
    posthog.capture("charts:new_chart_form_submit");
    api.dashboard.create.useQuery({
      projectId: props.projectId,
      name: values.name,
      query: {
        projectId: props.projectId,
        ...values.query,
      },
      chartConfig: {
        position: 0,
      },
      chartType: "timeseries",
    });
  }

  const columns = tableDefinitions.traces_metrics!.columns;

  return (
    <div>
      <Form {...form}>
        <form
          // eslint-disable-next-line @typescript-eslint/no-misused-promises
          onSubmit={form.handleSubmit(onSubmit)}
          className="space-y-8"
        >
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Name</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="flex flex-row items-center justify-center">
            <span className="ml-3 mr-3">Select</span>
            <Select
              value={selectState.column}
              onValueChange={(value) =>
                setSelectState({ ...selectState, column: value })
              }
            >
              <SelectTrigger className="min-w-[100px]">
                <SelectValue placeholder="Column" />
              </SelectTrigger>
              <SelectContent>
                {columns.map((option) => (
                  <SelectItem key={option.name} value={option.name}>
                    {option.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={selectState.agg}
              onValueChange={(value) =>
                setSelectState({
                  ...selectState,
                  agg: value as (typeof aggregationRawStrings)[number],
                })
              }
            >
              <SelectTrigger className="min-w-[100px]">
                <SelectValue placeholder="Column" />
              </SelectTrigger>
              <SelectContent>
                {aggregationRawStrings.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="ml-3 mr-3">Where</span>
            <FilterBuilder
              columns={columns}
              filterState={filterState}
              onChange={setFilterState}
            />
          </div>
          <Button
            type="submit"
            // loading={mutation.isLoading}
            className="w-full"
          >
            Create chart
          </Button>
        </form>
      </Form>
      {formError ? (
        <p className="text-red text-center">
          <span className="font-bold">Error:</span> {formError}
        </p>
      ) : null}
    </div>
  );
};
