import { DataTable } from "@/src/components/table/data-table";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import useColumnVisibility from "@/src/features/column-visibility/hooks/useColumnVisibility";
import { api } from "@/src/utils/api";
import { type EvalTemplate } from "@prisma/client";
import { useQueryParams, withDefault, NumberParam } from "use-query-params";

export type EvalsTemplateRow = {
  prompt: string;
  model: string;
  modelParameters: unknown;
  variables: string[];
  scores?: string;
  name?: string;
  reasoning?: string;
};

export default function EvalsTemplateTable({
  projectId,
}: {
  projectId: string;
}) {
  const [paginationState, setPaginationState] = useQueryParams({
    pageIndex: withDefault(NumberParam, 0),
    pageSize: withDefault(NumberParam, 50),
  });

  const templates = api.evals.allTemplates.useQuery({
    page: paginationState.pageIndex,
    limit: paginationState.pageSize,
    projectId,
  });
  const totalCount = templates.data?.totalCount ?? 0;

  const columns: LangfuseColumnDef<EvalsTemplateRow>[] = [
    {
      accessorKey: "prompt",
      header: "Prompt",
      enableHiding: true,
    },
    {
      accessorKey: "model",
      header: "Model",
      enableHiding: true,
    },
    {
      accessorKey: "modelParameters",
      header: "Model Parameters",
      enableHiding: true,
    },
    {
      accessorKey: "variables",
      header: "Variables",
      enableHiding: true,
    },
    {
      accessorKey: "score",
      header: "Score",
      enableHiding: true,
    },
    {
      accessorKey: "name",
      header: "Name",
      enableHiding: true,
    },
    {
      accessorKey: "reasoning",
      header: "Reasoning",
      enableHiding: true,
    },
  ];

  const [columnVisibility, setColumnVisibility] =
    useColumnVisibility<EvalsTemplateRow>("scoresColumnVisibility", columns);

  const convertToTableRow = (template: EvalTemplate): EvalsTemplateRow => {
    if (
      typeof template.outputSchema !== "object" ||
      template.outputSchema === null
    ) {
      return {
        prompt: template.prompt,
        model: template.model,
        modelParameters: template.modelParams,
        variables: template.vars,
      };
    }
    return {
      prompt: template.prompt,
      model: template.model,
      modelParameters: JSON.stringify(template.modelParams),
      variables: template.vars,
      scores:
        "scores" in template.outputSchema &&
        typeof template.outputSchema.scores === "string"
          ? template.outputSchema.scores
          : undefined,
      name:
        "name" in template.outputSchema &&
        typeof template.outputSchema.name === "string"
          ? template.outputSchema.name
          : undefined,
      reasoning:
        "reasoning" in template.outputSchema &&
        typeof template.outputSchema.reasoning === "string"
          ? template.outputSchema.reasoning
          : undefined,
    };
  };

  return (
    <div>
      <DataTable
        columns={columns}
        data={
          templates.isLoading
            ? { isLoading: true, isError: false }
            : templates.isError
              ? {
                  isLoading: false,
                  isError: true,
                  error: templates.error.message,
                }
              : {
                  isLoading: false,
                  isError: false,
                  data: templates.data.templates.map((t) =>
                    convertToTableRow(t),
                  ),
                }
        }
        pagination={{
          pageCount: Math.ceil(totalCount / paginationState.pageSize),
          onChange: setPaginationState,
          state: paginationState,
        }}
        columnVisibility={columnVisibility}
        onColumnVisibilityChange={setColumnVisibility}
      />
    </div>
  );
}
