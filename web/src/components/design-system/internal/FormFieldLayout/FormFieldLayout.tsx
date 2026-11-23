import { Info } from "@langfuse/icons";
import { type ComponentProps, type ReactElement } from "react";

import { type CustomTooltip } from "@/src/components/design-system/CustomTooltip/CustomTooltip";
import { FormError } from "@/src/components/design-system/FormError/FormError";
import { FormFieldDescription } from "./components/FormFieldDescription/FormFieldDescription";

export function FormFieldLayout(
  props: {
    label: string;
    description?: ComponentProps<typeof FormFieldDescription>["description"];
    descriptionId: string;
    registerLabelTooltip?: Parameters<
      ComponentProps<typeof CustomTooltip>["children"]
    >[0]["getTriggerProps"];
    required?: boolean;
    children: ReactElement;
  } & (
    | {
        variant: "field";
        controlId: string;
        errorMessage?: string;
        errorId: string;
        announceError?: boolean;
      }
    | {
        variant: "composite";
        labelId: string;
      }
  ),
) {
  const {
    label,
    description,
    descriptionId,
    registerLabelTooltip,
    required,
    variant,
    children,
  } = props;
  const Label = variant === "composite" ? "span" : "label";
  const labelId =
    props.variant === "composite" ? props.labelId : `${props.controlId}-label`;

  return (
    <div
      className="space-y-2"
      role={variant === "composite" ? "group" : undefined}
      aria-labelledby={variant === "composite" ? labelId : undefined}
      aria-describedby={
        variant === "composite" && description ? descriptionId : undefined
      }
    >
      <div className="flex items-center gap-1.5">
        <Label
          id={labelId}
          htmlFor={props.variant === "field" ? props.controlId : undefined}
          className="text-sm leading-none font-bold"
        >
          {label}
          {required ? (
            <span aria-hidden className="text-destructive ml-1">
              *
            </span>
          ) : null}
        </Label>
        {registerLabelTooltip ? (
          <button
            type="button"
            {...registerLabelTooltip()}
            aria-label={`About ${label}`}
          >
            <Info aria-hidden size="base" color="muted" />
          </button>
        ) : null}
      </div>
      <div className="space-y-1">
        {children}
        {props.variant === "field" && props.errorMessage ? (
          <FormError
            id={props.errorId}
            message={props.errorMessage}
            announce={props.announceError}
          />
        ) : null}
      </div>
      {description ? (
        <FormFieldDescription id={descriptionId} description={description} />
      ) : null}
    </div>
  );
}
