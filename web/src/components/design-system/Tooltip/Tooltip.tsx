"use client";

import * as React from "react";

import { CustomTooltip } from "../CustomTooltip/CustomTooltip";

type TooltipProps = Omit<
  React.ComponentProps<typeof CustomTooltip>,
  "content"
> & {
  label: string;
};

function Tooltip({ label, ...props }: TooltipProps) {
  return <CustomTooltip content={<span>{label}</span>} {...props} />;
}

export { Tooltip };
