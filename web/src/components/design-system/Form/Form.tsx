import {
  type ComponentProps,
  type FormHTMLAttributes,
  type ReactNode,
} from "react";
import {
  type FieldPath,
  type FieldPathByValue,
  type FieldPathValue,
  type FieldValues,
} from "react-hook-form";

import { Button } from "@/src/components/design-system/Button/Button";
import { CopyInput } from "@/src/components/design-system/CopyInput/CopyInput";
import { FormError } from "@/src/components/design-system/FormError/FormError";
import {
  FormField,
  type FormFieldProps,
} from "@/src/components/design-system/FormField/FormField";
import { FormCompositeField } from "@/src/components/design-system/FormCompositeField/FormCompositeField";
import { Input } from "@/src/components/design-system/Input/Input";
import { PasswordInput } from "@/src/components/design-system/PasswordInput/PasswordInput";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import { useCopyToClipboard } from "@/src/hooks/useCopyToClipboard";

/** Wraps Form.Field with SelectInput and its form bindings. */
function FormSelectInputField<
  TFieldValues extends FieldValues,
  TName extends FieldPathByValue<TFieldValues, string>,
  TTransformedValues extends FieldValues = TFieldValues,
>({
  control,
  name,
  label,
  description,
  registerLabelTooltip,
  required,
  "aria-describedby": describedBy,
  ...inputProps
}: Omit<FormFieldProps<TFieldValues, TName, TTransformedValues>, "children"> &
  Omit<
    ComponentProps<
      typeof SelectInput<Extract<FieldPathValue<TFieldValues, TName>, string>>
    >,
    | "id"
    | "value"
    | "onValueChange"
    | "onBlur"
    | "ref"
    | "error"
    | "aria-invalid"
  >) {
  return (
    <FormField
      control={control}
      name={name}
      label={label}
      description={description}
      registerLabelTooltip={registerLabelTooltip}
      required={required}
    >
      {(field) => (
        <SelectInput<Extract<FieldPathValue<TFieldValues, TName>, string>>
          {...inputProps}
          id={field.id}
          // FieldPathByValue restricts names to string fields; RHF's generic value type does not retain that constraint.
          value={
            field.value as Extract<FieldPathValue<TFieldValues, TName>, string>
          }
          onValueChange={field.onChange}
          onBlur={field.onBlur}
          ref={field.ref}
          aria-describedby={
            [field.inputDescribedById, describedBy].filter(Boolean).join(" ") ||
            undefined
          }
          aria-invalid={Boolean(field.error)}
          error={Boolean(field.error)}
        />
      )}
    </FormField>
  );
}

/** Wraps Form.Field with the default Input and its form bindings. */
function FormInputField<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
  TTransformedValues extends FieldValues = TFieldValues,
>({
  control,
  name,
  label,
  description,
  registerLabelTooltip,
  required,
  "aria-describedby": describedBy,
  transformValue,
  ...inputProps
}: Omit<FormFieldProps<TFieldValues, TName, TTransformedValues>, "children"> &
  Omit<
    ComponentProps<typeof Input>,
    | "id"
    | "name"
    | "value"
    | "defaultValue"
    | "onChange"
    | "onBlur"
    | "ref"
    | "error"
    | "aria-invalid"
  > & {
    /** Normalizes incoming text before updating form state. */
    transformValue?: (value: string) => string;
  }) {
  return (
    <FormField
      control={control}
      name={name}
      label={label}
      description={description}
      registerLabelTooltip={registerLabelTooltip}
      required={required}
    >
      {(field) => (
        <Input
          {...inputProps}
          id={field.id}
          name={field.name}
          value={field.value}
          onChange={(event) => {
            const value = event.target.value;
            field.onChange(transformValue ? transformValue(value) : value);
          }}
          onBlur={field.onBlur}
          ref={field.ref}
          required={required}
          aria-describedby={
            [field.inputDescribedById, describedBy].filter(Boolean).join(" ") ||
            undefined
          }
          aria-invalid={Boolean(field.error)}
          error={Boolean(field.error)}
        />
      )}
    </FormField>
  );
}

function FormCopyInputField({
  label,
  description,
  ...inputProps
}: Pick<ComponentProps<typeof FormField>, "label" | "description"> &
  Pick<ComponentProps<typeof CopyInput>, "value" | "copyLabel" | "noCapture">) {
  const clipboard = useCopyToClipboard();

  return (
    <FormField
      label={label}
      description={description}
      error={
        clipboard.copyStatus.kind === "failed"
          ? "Copy failed. Select the value and copy it manually."
          : undefined
      }
    >
      {({ id, inputDescribedById }) => (
        <CopyInput
          {...inputProps}
          id={id}
          aria-describedby={inputDescribedById}
          clipboard={clipboard}
        />
      )}
    </FormField>
  );
}

/** Wraps Form.Field with PasswordInput and its form bindings. */
function FormPasswordInputField<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
  TTransformedValues extends FieldValues = TFieldValues,
>({
  control,
  name,
  label,
  description,
  registerLabelTooltip,
  required,
  "aria-describedby": describedBy,
  ...inputProps
}: Omit<FormFieldProps<TFieldValues, TName, TTransformedValues>, "children"> &
  Omit<
    ComponentProps<typeof PasswordInput>,
    | "id"
    | "name"
    | "value"
    | "defaultValue"
    | "onChange"
    | "onBlur"
    | "ref"
    | "error"
    | "aria-invalid"
  >) {
  return (
    <FormField
      control={control}
      name={name}
      label={label}
      description={description}
      registerLabelTooltip={registerLabelTooltip}
      required={required}
    >
      {(field) => (
        <PasswordInput
          {...inputProps}
          id={field.id}
          name={field.name}
          value={field.value}
          onChange={field.onChange}
          onBlur={field.onBlur}
          ref={field.ref}
          required={required}
          aria-describedby={
            [field.inputDescribedById, describedBy].filter(Boolean).join(" ") ||
            undefined
          }
          aria-invalid={Boolean(field.error)}
          error={Boolean(field.error)}
        />
      )}
    </FormField>
  );
}

export type FormAction = {
  id: string;
  text: string;
  variant?: "primary" | "secondary" | "ghost";
  disabled?: boolean;
  loading?: boolean;
} & (
  | {
      type: "submit";
      onClick?: never;
    }
  | {
      type: "button";
      onClick: () => void;
    }
);

export type FormProps = {
  id?: FormHTMLAttributes<HTMLFormElement>["id"];
  density?: "default" | "compact";
  actions: FormAction[];
  children: ReactNode;
  onSubmit: FormHTMLAttributes<HTMLFormElement>["onSubmit"];
};

function FormRoot({
  actions,
  children,
  density = "default",
  id,
  onSubmit,
}: FormProps) {
  return (
    <form id={id} className="flex flex-col gap-8" onSubmit={onSubmit}>
      <div
        className={
          density === "compact" ? "flex flex-col gap-4" : "flex flex-col gap-5"
        }
      >
        {children}
      </div>
      {actions.length > 0 && (
        <div className="flex gap-2">
          {actions.map((action) => {
            if (action.type === "submit") {
              return (
                <Button
                  key={action.id}
                  type="submit"
                  text={action.text}
                  variant={action.variant}
                  disabled={action.disabled}
                  loading={action.loading}
                />
              );
            }

            return (
              <Button
                key={action.id}
                type="button"
                text={action.text}
                variant={action.variant}
                disabled={action.disabled}
                loading={action.loading}
                onClick={action.onClick}
              />
            );
          })}
        </div>
      )}
    </form>
  );
}

export const Form = Object.assign(FormRoot, {
  Error: FormError,
  Field: FormField,
  CompositeField: FormCompositeField,
  CopyInputField: FormCopyInputField,
  InputField: FormInputField,
  PasswordInputField: FormPasswordInputField,
  SelectInputField: FormSelectInputField,
});
