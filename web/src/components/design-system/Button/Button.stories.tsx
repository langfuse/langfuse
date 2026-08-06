import { Sparkles } from "lucide-react";
import { fn } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { Button } from "./Button";

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
  args: { label: "Documentation", importance: "secondary", onClick: fn() },
});

export const Borderless = meta.story({
  args: { label: "Learn more", importance: "borderless", onClick: fn() },
});

export const Warning = meta.story({
  args: { label: "Delete project", status: "warning", onClick: fn() },
});

export const WithIcon = meta.story({
  args: {
    label: "Onboard with AI",
    importance: "secondary",
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

const IMPORTANCES = ["primary", "secondary", "borderless"] as const;
const STATUSES = ["default", "error", "warning", "success", "info"] as const;
const STATES = ["default", "hovered", "focused", "disabled"] as const;
const ICONS = ["text-only", "text-and-icon", "icon-only"] as const;

export const VariantMatrix = meta.story({
  render: () => (
    <div className="flex flex-col gap-6">
      {STATUSES.map((status) => (
        <div key={status} className="flex flex-col gap-2">
          <span className="text-muted-foreground font-mono text-[10px] uppercase">
            {status}
          </span>
          {STATES.map((state) => (
            <div key={state} className="flex items-center gap-4">
              <span className="text-muted-foreground w-16 font-mono text-[10px]">
                {state}
              </span>
              {IMPORTANCES.map((importance) => (
                <Button
                  key={importance}
                  label={importance}
                  importance={importance}
                  status={status}
                  state={state}
                />
              ))}
            </div>
          ))}
        </div>
      ))}
      <div className="flex flex-col gap-2">
        <span className="text-muted-foreground font-mono text-[10px] uppercase">
          icon modes
        </span>
        <div className="flex items-center gap-4">
          {ICONS.map((icon) =>
            icon === "text-only" ? (
              <Button key={icon} label="text-only" icon={icon} />
            ) : (
              <Button key={icon} label={icon} icon={icon} Icon={Sparkles} />
            ),
          )}
        </div>
      </div>
    </div>
  ),
});
