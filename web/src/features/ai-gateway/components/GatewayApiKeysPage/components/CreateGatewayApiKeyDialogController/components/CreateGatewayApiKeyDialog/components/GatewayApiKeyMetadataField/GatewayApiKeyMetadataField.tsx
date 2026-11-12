import { Plus, X } from "@langfuse/icons";
import { useController, useFieldArray, type Control } from "react-hook-form";

import { Button } from "@/src/components/design-system/Button/Button";
import { CustomTooltip } from "@/src/components/design-system/CustomTooltip/CustomTooltip";
import { FormField } from "@/src/components/design-system/FormField/FormField";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { Input } from "@/src/components/design-system/Input/Input";
import type { CreateGatewayApiKeyFormValues } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/CreateGatewayApiKeyDialogController/components/CreateGatewayApiKeyDialog/types/createGatewayApiKeyFormSchema";

const EMPTY_METADATA_FIELD = { key: "", value: "" };

type GatewayApiKeyMetadataFieldProps = {
  control: Control<CreateGatewayApiKeyFormValues>;
};

export function GatewayApiKeyMetadataField({
  control,
}: GatewayApiKeyMetadataFieldProps) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: "metadata",
  });
  const handleAdd = () => append(EMPTY_METADATA_FIELD);

  return (
    <CustomTooltip
      content={
        <span>
          Attached to every trace from this key, so you can filter and group by
          it.
        </span>
      }
    >
      {({ getTriggerProps }) => (
        <FormField
          label="Metadata (optional)"
          registerLabelTooltip={getTriggerProps}
        >
          {(field) => (
            <div
              id={field.id}
              role="group"
              aria-label="Metadata"
              className="flex flex-col items-start gap-2"
            >
              {fields.map((metadataField, index) => (
                <MetadataRow
                  key={metadataField.id}
                  control={control}
                  index={index}
                  onRemove={remove}
                />
              ))}
              <Button
                text="Add metadata"
                variant="text"
                icon={Plus}
                onClick={handleAdd}
              />
            </div>
          )}
        </FormField>
      )}
    </CustomTooltip>
  );
}

function MetadataRow({
  control,
  index,
  onRemove,
}: {
  control: Control<CreateGatewayApiKeyFormValues>;
  index: number;
  onRemove: (index: number) => void;
}) {
  const { field: keyField } = useController({
    control,
    name: `metadata.${index}.key`,
  });
  const { field: valueField } = useController({
    control,
    name: `metadata.${index}.value`,
  });
  const handleRemove = () => onRemove(index);

  return (
    <div className="ph-no-capture flex w-full items-center gap-2">
      <Input
        aria-label="Metadata key"
        placeholder="key"
        name={keyField.name}
        value={keyField.value}
        onChange={keyField.onChange}
        onBlur={keyField.onBlur}
        ref={keyField.ref}
      />
      <Input
        aria-label="Metadata value"
        placeholder="value"
        name={valueField.name}
        value={valueField.value}
        onChange={valueField.onChange}
        onBlur={valueField.onBlur}
        ref={valueField.ref}
      />
      <IconButton
        icon={X}
        label="Remove metadata field"
        size="sm"
        onClick={handleRemove}
      />
    </div>
  );
}
