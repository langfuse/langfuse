"use client";

import * as React from "react";

type RadioProps = Pick<
  React.ComponentPropsWithRef<"input">,
  | "aria-label"
  | "checked"
  | "defaultChecked"
  | "disabled"
  | "id"
  | "name"
  | "onChange"
  | "ref"
  | "required"
  | "value"
>;

function Radio({ ref, ...props }: RadioProps) {
  return (
    <span className="relative inline-flex h-4 w-4 shrink-0">
      <input
        ref={ref}
        type="radio"
        className="peer absolute inset-0 m-0 h-4 w-4 cursor-pointer opacity-0 disabled:cursor-not-allowed"
        {...props}
      />
      <span
        aria-hidden="true"
        className="border-control-border peer-checked:border-control-fill peer-focus-visible:ring-ring flex h-4 w-4 items-center justify-center rounded-full border shadow-sm peer-focus-visible:ring-1 peer-focus-visible:outline-hidden peer-disabled:opacity-50 peer-checked:[&>span]:opacity-100"
      >
        <span className="bg-control-fill h-2 w-2 rounded-full opacity-0" />
      </span>
    </span>
  );
}

export { Radio };
