import { createContext, useContext, type ReactNode } from "react";
import {
  useForm as useReactHookForm,
  type FieldPath,
  type FieldValues,
  type SubmitHandler,
  type UseFormProps,
  type UseFormReturn,
} from "react-hook-form";

import {
  Form,
  type FormAction,
} from "@/src/components/design-system/Form/Form";
import {
  FormField,
  type FormFieldProps,
} from "@/src/components/design-system/FormField/FormField";

/**
 * Creates a form family whose root, fields, and hooks share the same value
 * types. A factory is required because JSX children cannot infer their generic
 * types from a parent component.
 *
 * `TInput` represents values before resolver transformation and `TOutput`
 * represents the values passed to `onSubmit` afterward.
 */
export function createForm<
  TInput extends FieldValues,
  TOutput extends FieldValues = TInput,
>() {
  // Each form family gets an isolated context, preventing fields created by one
  // factory call from accidentally consuming another family's form instance.
  const FormContext = createContext<
    UseFormReturn<TInput, undefined, TOutput> | undefined
  >(undefined);

  function useBoundFormContext() {
    const form = useContext(FormContext);

    if (!form) {
      throw new Error(
        "Form components must be rendered within their bound Form",
      );
    }

    return form;
  }

  function BoundField<TName extends FieldPath<TInput>>({
    children,
    description,
    label,
    name,
    registerLabelTooltip,
  }: Omit<FormFieldProps<TInput, TName, TOutput>, "control">) {
    const form = useBoundFormContext();

    return (
      <FormField
        control={form.control}
        name={name}
        label={label}
        description={description}
        registerLabelTooltip={registerLabelTooltip}
      >
        {children}
      </FormField>
    );
  }

  function BoundForm({
    actions,
    children,
    form,
    onSubmit,
  }: {
    actions: FormAction[];
    children: ReactNode;
    form: UseFormReturn<TInput, undefined, TOutput>;
    onSubmit: SubmitHandler<TOutput>;
  }) {
    return (
      <FormContext.Provider value={form}>
        <Form actions={actions} onSubmit={form.handleSubmit(onSubmit)}>
          {children}
        </Form>
      </FormContext.Provider>
    );
  }

  function useBoundForm(props: UseFormProps<TInput, undefined, TOutput>) {
    return useReactHookForm<TInput, undefined, TOutput>(props);
  }

  // Object.assign preserves the compound-component API while exposing hooks
  // that retain this factory invocation's input and output types.
  return Object.assign(BoundForm, {
    Field: BoundField,
    useForm: useBoundForm,
    useFormContext: useBoundFormContext,
  });
}
