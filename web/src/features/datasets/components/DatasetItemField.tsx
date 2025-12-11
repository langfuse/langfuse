import { CodeMirrorEditor } from "@/src/components/editor";
import { DatasetSchemaHoverCard } from "./DatasetSchemaHoverCard";
import { DatasetItemFieldSchemaErrors } from "./DatasetItemFieldSchemaErrors";
import type { Prisma } from "@langfuse/shared";
import {
  FormControl,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";

type DatasetError = {
  datasetId: string;
  datasetName: string;
  field: "input" | "expectedOutput";
  errors: Array<{
    path: string;
    message: string;
  }>;
};

type DatasetItemFieldProps = {
  label: string;
  value: string;
  schema?: Prisma.JsonValue | null;
  schemaType?: "input" | "expectedOutput";
  editable: boolean;
  onChange?: (value: string) => void;
  errors?: DatasetError[];
  hasInteracted?: boolean;
  hasSchemas?: boolean;
  // For form integration
  isFormField?: boolean;
};

/**
 * Reusable field component for dataset item input/output/metadata.
 * Handles display, editing, schema validation, and error messages.
 */
export const DatasetItemField = ({
  label,
  value,
  schema,
  schemaType,
  editable,
  onChange,
  errors = [],
  hasInteracted = true,
  hasSchemas = false,
  isFormField = false,
}: DatasetItemFieldProps) => {
  const content = (
    <>
      <div className="flex items-center gap-2">
        {isFormField ? (
          <FormLabel>{label}</FormLabel>
        ) : (
          <label className="text-sm font-medium">{label}</label>
        )}
        {schema && schemaType && (
          <DatasetSchemaHoverCard
            schema={schema}
            schemaType={schemaType}
            showLabel
          />
        )}
      </div>
      {isFormField ? (
        <FormControl>
          <CodeMirrorEditor
            mode="json"
            value={value}
            onChange={onChange}
            editable={editable}
            minHeight={200}
          />
        </FormControl>
      ) : (
        <CodeMirrorEditor
          mode="json"
          value={value}
          editable={editable}
          minHeight={200}
        />
      )}
      {isFormField && <FormMessage />}
      {hasSchemas && errors.length > 0 && hasInteracted && (
        <DatasetItemFieldSchemaErrors errors={errors} showDatasetName={false} />
      )}
    </>
  );

  return isFormField ? (
    <FormItem>{content}</FormItem>
  ) : (
    <div className="space-y-2">{content}</div>
  );
};
