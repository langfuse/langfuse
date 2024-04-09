import { type ColumnDefinition } from "@/src/server/api/interfaces/tableDefinition";

export const modelsTableCols: ColumnDefinition[] = [
  {
    name: "Maintainer",
    id: "maintainer",
    type: "stringOptions",
    internal: `(CASE WHEN m."project_id" IS NOT NULL THEN 'User' ELSE 'Langfuse' END)`,
    options: [{ value: "User" }, { value: "Langfuse" }],
  },
  {
    name: "Model Name",
    id: "modelName",
    type: "string",
    internal: 'm."model_name"',
  },
  {
    name: "Match Pattern",
    id: "matchPattern",
    type: "string",
    internal: 'm."match_pattern"',
  },
  {
    name: "Start Date",
    id: "startDate",
    type: "datetime",
    internal: 'm."start_date"',
  },
  {
    name: "Input Price",
    id: "inputPrice",
    type: "number",
    internal: 'm."input_price"',
  },
  {
    name: "Output Price",
    id: "outputPrice",
    type: "number",
    internal: 'm."output_price"',
  },
  {
    name: "Total Price",
    id: "totalPrice",
    type: "number",
    internal: 'm."total_price"',
  },
  { name: "Unit", id: "unit", type: "string", internal: 'm."unit"' },
  {
    name: "Tokenizer",
    id: "tokenizerId",
    type: "string",
    internal: 'm."tokenizer_id"',
  },
];
