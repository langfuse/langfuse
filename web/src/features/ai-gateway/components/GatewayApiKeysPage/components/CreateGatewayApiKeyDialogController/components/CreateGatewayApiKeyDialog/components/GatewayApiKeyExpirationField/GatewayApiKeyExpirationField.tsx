import { useController, type Control } from "react-hook-form";

import { Button } from "@/src/components/design-system/Button/Button";
import { Form } from "@/src/components/design-system/Form/Form";
import { Input } from "@/src/components/design-system/Input/Input";
import { localDateInputValue } from "@/src/features/apiKey/fns/localDateInputValue";
import {
  gatewayApiKeyExpirationOptions,
  type GatewayApiKeyExpirationPreset,
} from "@/src/features/ai-gateway/constants/gatewayApiKeyExpirationOptions";
import type { CreateGatewayApiKeyFormValues } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/CreateGatewayApiKeyDialogController/components/CreateGatewayApiKeyDialog/types/createGatewayApiKeyFormSchema";

type GatewayApiKeyExpirationFieldProps = {
  control: Control<CreateGatewayApiKeyFormValues>;
};

export function GatewayApiKeyExpirationField({
  control,
}: GatewayApiKeyExpirationFieldProps) {
  return (
    <Form.Field control={control} name="expiryPreset" label="Expiration">
      {(field) => (
        <div className="flex flex-col gap-2">
          <div
            id={field.id}
            role="group"
            aria-label="Expiration"
            className="flex flex-wrap gap-2"
          >
            {gatewayApiKeyExpirationOptions.map((option) => (
              <ExpirationOptionButton
                key={option.value}
                label={option.label}
                value={option.value}
                selected={field.value === option.value}
                onSelect={field.onChange}
              />
            ))}
          </div>
          {field.value === "custom" ? (
            <CustomExpirationInput control={control} />
          ) : null}
        </div>
      )}
    </Form.Field>
  );
}

function ExpirationOptionButton({
  label,
  value,
  selected,
  onSelect,
}: {
  label: string;
  value: GatewayApiKeyExpirationPreset;
  selected: boolean;
  onSelect: (value: GatewayApiKeyExpirationPreset) => void;
}) {
  const handleClick = () => onSelect(value);
  return (
    <Button
      text={label}
      size="sm"
      variant={selected ? "primary" : "outline"}
      data-state={selected ? "on" : "off"}
      onClick={handleClick}
    />
  );
}

function CustomExpirationInput({
  control,
}: {
  control: Control<CreateGatewayApiKeyFormValues>;
}) {
  const { field, fieldState } = useController({
    control,
    name: "customExpiry",
  });
  return (
    <div className="flex flex-col gap-1">
      <div className="w-fit">
        <Input
          type="date"
          aria-label="Custom expiration date"
          min={localDateInputValue(new Date())}
          name={field.name}
          value={field.value}
          onChange={field.onChange}
          onBlur={field.onBlur}
          ref={field.ref}
          error={!!fieldState.error}
        />
      </div>
      <p className="text-muted-foreground text-sm">
        Key stops working at the end of this day.
      </p>
    </div>
  );
}
