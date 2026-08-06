import { Sparkles } from "lucide-react";
import { Fragment } from "react";
import { fn } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { Button, BUTTON_TOKENS } from "./Button";

const meta = preview.meta({
  component: Button,
  parameters: {
    layout: "centered",
  },
});

export const Default = meta.story({
  args: { label: "Start free", onClick: fn() },
});

export const Secondary = meta.story({
  args: { label: "Documentation", type: "secondary", onClick: fn() },
});

export const Borderless = meta.story({
  args: { label: "Learn more", type: "borderless", onClick: fn() },
});

export const Danger = meta.story({
  args: { label: "Delete project", status: "danger", onClick: fn() },
});

export const WithIcon = meta.story({
  args: {
    label: "Onboard with AI",
    type: "secondary",
    icon: "text-and-icon",
    Icon: Sparkles,
    onClick: fn(),
  },
});

export const IconOnly = meta.story({
  args: {
    label: "Onboard with AI",
    icon: "icon-only",
    Icon: Sparkles,
    onClick: fn(),
  },
});

export const Disabled = meta.story({
  args: { label: "Start free", state: "disabled" },
});

const TYPES = ["primary", "secondary", "borderless"] as const;
const STATUSES = ["default", "danger"] as const;
const STATES = ["default", "hovered", "focused", "disabled"] as const;

export const VariantMatrix = meta.story({
  render: () => (
    <div className="flex flex-col gap-8">
      {STATUSES.map((status) => (
        <div key={status} className="flex flex-col gap-2">
          <span className="text-muted-foreground font-mono text-[10px] uppercase">
            {status}
          </span>
          <div className="grid grid-cols-[56px_repeat(3,auto)] items-center gap-x-6 gap-y-2">
            <span />
            {TYPES.map((type) => (
              <span
                key={type}
                className="text-muted-foreground font-mono text-[9px]"
              >
                {type}
              </span>
            ))}
            {STATES.map((state) => (
              <Fragment key={state}>
                <span className="text-muted-foreground font-mono text-[10px]">
                  {state}
                </span>
                {TYPES.map((type) => (
                  <div key={type} className="flex items-center gap-1.5">
                    <Button
                      label="Button"
                      type={type}
                      status={status}
                      state={state}
                    />
                    <Button
                      label="Button"
                      type={type}
                      status={status}
                      state={state}
                      icon="text-and-icon"
                      Icon={Sparkles}
                    />
                    <Button
                      label="Button"
                      type={type}
                      status={status}
                      state={state}
                      icon="icon-only"
                      Icon={Sparkles}
                    />
                  </div>
                ))}
              </Fragment>
            ))}
          </div>
          <div className="flex flex-col gap-0.5 pt-1">
            {TYPES.map((type) => (
              <span
                key={type}
                className="text-muted-foreground font-mono text-[9px]"
              >
                {type} — {BUTTON_TOKENS[type][status]}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  ),
});
