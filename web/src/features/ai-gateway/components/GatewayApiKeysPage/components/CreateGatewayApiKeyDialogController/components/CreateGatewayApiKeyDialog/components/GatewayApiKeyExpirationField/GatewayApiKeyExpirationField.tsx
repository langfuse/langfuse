import { useController, type Control } from "react-hook-form";

import { Form } from "@/src/components/design-system/Form/Form";
import { Input } from "@/src/components/design-system/Input/Input";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { localDateInputValue } from "@/src/features/apiKey/fns/localDateInputValue";
import { gatewayApiKeyExpirationOptions } from "@/src/features/ai-gateway/constants/gatewayApiKeyExpirationOptions";
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
          <div id={field.id}>
            <Tabs
              activationMode="manual"
              value={field.value}
              onValueChange={field.onChange}
            >
              <Tabs.List variant="inset" size="md" aria-label="Expiration">
                {gatewayApiKeyExpirationOptions.map((option) => (
                  <Tabs.Trigger
                    key={option.value}
                    value={option.value}
                    label={option.label}
                  />
                ))}
              </Tabs.List>
            </Tabs>
          </div>
          {field.value === "custom" ? (
            <CustomExpirationInput control={control} />
          ) : null}
        </div>
      )}
    </Form.Field>
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
          aria-invalid={!!fieldState.error}
        />
      </div>
      {fieldState.error ? (
        <p className="text-destructive text-sm">{fieldState.error.message}</p>
      ) : null}
      <p className="text-muted-foreground text-sm">
        Key stops working at the end of this day.
      </p>
    </div>
  );
}
