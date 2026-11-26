import { useController, type Control } from "react-hook-form";

import { CustomTooltip } from "@/src/components/design-system/CustomTooltip/CustomTooltip";
import { Form } from "@/src/components/design-system/Form/Form";
import { Input } from "@/src/components/design-system/Input/Input";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { localDateInputValue } from "@/src/features/apiKey/fns/localDateInputValue";
import { gatewayApiKeyExpirationOptions } from "@/src/features/ai-gateway/constants/gatewayApiKeyExpirationOptions";
import type { GatewayApiKeyFormValues } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/GatewayApiKeyDialog/types/gatewayApiKeyFormSchema";

// The section is removed instead of choosing "never".
const sectionExpirationOptions = gatewayApiKeyExpirationOptions.filter(
  (option) => option.value !== "never",
);

type GatewayApiKeyExpirationFieldProps = {
  control: Control<GatewayApiKeyFormValues>;
  disabled: boolean;
};

export function GatewayApiKeyExpirationField({
  control,
  disabled,
}: GatewayApiKeyExpirationFieldProps) {
  return (
    <CustomTooltip
      content={
        <span>
          The key stops working after this. It cannot be changed once the key is
          created.
        </span>
      }
    >
      {({ getTriggerProps }) => (
        <Form.Field
          control={control}
          name="expiryPreset"
          label="Expiration"
          registerLabelTooltip={getTriggerProps}
        >
          {(field) => (
            <div className="flex flex-col gap-2">
              <div id={field.id}>
                <Tabs
                  activationMode="manual"
                  value={field.value}
                  onValueChange={field.onChange}
                >
                  <Tabs.List variant="inset" size="md" aria-label="Expiration">
                    {sectionExpirationOptions.map((option) => (
                      <Tabs.Trigger
                        key={option.value}
                        value={option.value}
                        label={option.label}
                        disabled={disabled}
                      />
                    ))}
                  </Tabs.List>
                </Tabs>
              </div>
              {field.value === "custom" ? (
                <CustomExpirationInput control={control} disabled={disabled} />
              ) : null}
            </div>
          )}
        </Form.Field>
      )}
    </CustomTooltip>
  );
}

function CustomExpirationInput({
  control,
  disabled,
}: {
  control: Control<GatewayApiKeyFormValues>;
  disabled: boolean;
}) {
  const { field, fieldState } = useController({
    control,
    name: "customExpiry",
  });
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
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
            disabled={disabled}
            error={!!fieldState.error}
            aria-invalid={!!fieldState.error}
          />
        </div>
        <p className="text-muted-foreground text-sm">
          Key stops working at the end of this day.
        </p>
      </div>
      {fieldState.error ? (
        <p className="text-destructive text-sm">{fieldState.error.message}</p>
      ) : null}
    </div>
  );
}
