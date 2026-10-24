import { type FormHTMLAttributes, type ReactNode } from "react";

import { Button } from "@/src/components/design-system/Button/Button";
import { FormField } from "@/src/components/design-system/FormField/FormField";

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
  Field: FormField,
});
