import * as React from "react";
import { Switch } from "@headlessui/react";
import { cn } from "@/src/utils/tailwind";

export const Slider = (props: {
  disabled: boolean; // whether the slider is clickable in the UI
  loading?: boolean;
  onChecked?: (checked: boolean) => void;
  isChecked?: boolean; // whether the slider is active
}) => (
  <Switch
    checked={props.isChecked}
    disabled={props.loading || props.disabled}
    onChange={props.onChecked}
    className={cn(
      props.isChecked ? "bg-background" : "bg-input",
      "relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-foreground focus:ring-offset-2",
    )}
  >
    <span className="sr-only">Use setting</span>
    <span
      aria-hidden="true"
      className={cn(
        props.isChecked ? "translate-x-5" : "translate-x-0",
        "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-background shadow ring-0 transition duration-200 ease-in-out",
      )}
    />
  </Switch>
);
