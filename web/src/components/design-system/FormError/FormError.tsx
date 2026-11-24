import { type ComponentProps } from "react";

/**
 * Shared error presentation for field validation and failed form-related actions.
 * Prefer Form's field components for inputs; they associate validation errors with
 * their controls automatically. Use Form.Error directly for custom controls or
 * form-wide errors, associating custom input errors via id and aria-describedby.
 *
 * Use announce for failures after explicit actions, such as submitting, testing a
 * connection, or copying. Keep the component mounted without a message before
 * the error arrives so its alert region can announce updates. Omit announce for
 * inline validation, particularly errors that change while typing.
 *
 * Success messages and neutral instructions should not use this component.
 */
export function FormError({
  message,
  announce,
  ...props
}: Pick<ComponentProps<"p">, "id"> & {
  message: string | null | undefined;
  /** Enables an assertive alert region. Keep mounted before the error arrives. */
  announce?: boolean;
}) {
  return (
    <p
      {...props}
      role={announce ? "alert" : undefined}
      className="text-destructive text-sm empty:sr-only"
    >
      {message}
    </p>
  );
}
