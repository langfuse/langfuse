import { useState } from "react";
import { Check, RotateCcw } from "lucide-react";
import { EmojiPicker } from "@ferrucc-io/emoji-picker";
import { PopoverController } from "@/src/components/ui/popover";
import { Button } from "@/src/components/design-system/Button/Button";
import { SearchInput } from "@/src/components/design-system/SearchInput/SearchInput";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import {
  AGENT_COLORS,
  AGENT_ICON_IDS,
  AGENT_MASCOTS,
  type AgentAppearance,
} from "./appearance";
import { AgentGlyph } from "./AgentGlyph";
import { useAgentAppearance, useAgentAppearanceStore } from "./appearanceStore";

function AppearanceChoices({
  projectId,
  agentName,
}: {
  projectId: string;
  agentName: string;
}) {
  const appearance = useAgentAppearance(projectId, agentName);
  const save = useAgentAppearanceStore((state) => state.set);
  const reset = useAgentAppearanceStore((state) => state.reset);
  const [tab, setTab] = useState("icons");
  const [search, setSearch] = useState("");
  const select = (glyph: AgentAppearance["glyph"]) =>
    save(projectId, agentName, { ...appearance, glyph });
  const choices = (tab === "mascots" ? AGENT_MASCOTS : AGENT_ICON_IDS).filter(
    (id) => id.includes(search.trim().toLowerCase()),
  );
  return (
    <div className="ph-no-capture flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-3">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <p className="truncate text-sm font-bold" title={agentName}>
          Appearance · {agentName}
        </p>
        <AgentGlyph appearance={appearance} size="md" />
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <Tabs.List variant="underline">
          <Tabs.Trigger value="icons" label="Icons" />
          <Tabs.Trigger value="emoji" label="Emojis" />
          <Tabs.Trigger value="mascots" label="Mascots" />
        </Tabs.List>
      </Tabs>
      <div
        className="flex items-center gap-2"
        role="group"
        aria-label="Agent color"
      >
        {AGENT_COLORS.map((color) => (
          <button
            key={color.value}
            type="button"
            aria-label={color.name}
            aria-pressed={appearance.color === color.value}
            onClick={() =>
              save(projectId, agentName, { ...appearance, color: color.value })
            }
            className="focus-visible:ring-ring flex size-6 shrink-0 items-center justify-center rounded-full border border-white/20 focus-visible:ring-2"
            style={{ backgroundColor: color.value }}
          >
            {appearance.color === color.value && (
              <Check className="icon-base" style={{ color: "#0f172a" }} />
            )}
          </button>
        ))}
        <label
          className="relative flex size-6 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full border"
          title="Custom color"
        >
          <span
            aria-hidden="true"
            className="absolute inset-0"
            style={{
              background: "linear-gradient(135deg, #fb7185, #fcd34d, #22d3ee)",
            }}
          />
          <input
            type="color"
            aria-label="Custom agent color"
            value={appearance.color}
            onChange={(event) =>
              save(projectId, agentName, {
                ...appearance,
                color: event.target.value,
              })
            }
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
      </div>
      {tab === "emoji" ? (
        <EmojiPicker
          onEmojiSelect={(value) => select({ kind: "emoji", value })}
          className="h-72 w-full"
        >
          <EmojiPicker.Header>
            <EmojiPicker.Input
              placeholder="Search emojis…"
              className="w-full rounded-md border bg-transparent p-2 text-sm"
            />
          </EmojiPicker.Header>
          <EmojiPicker.Group className="overflow-y-auto overscroll-contain">
            <EmojiPicker.List containerHeight={224} />
          </EmojiPicker.Group>
        </EmojiPicker>
      ) : (
        <>
          <SearchInput
            value={search}
            onChange={setSearch}
            onSubmit={setSearch}
            placeholder={
              tab === "mascots" ? "Search mascots…" : "Search icons…"
            }
          />
          <div
            className="grid max-h-64 grid-cols-8 gap-1 overflow-y-auto"
            role="group"
            aria-label={tab === "mascots" ? "Mascots" : "Icons"}
          >
            {choices.map((id) => (
              <button
                type="button"
                key={id}
                aria-label={id}
                aria-pressed={
                  appearance.glyph.kind !== "emoji" &&
                  appearance.glyph.id === id
                }
                onClick={() =>
                  select({ kind: tab === "mascots" ? "mascot" : "icon", id })
                }
                className="hover:bg-accent aria-pressed:border-primary focus-visible:ring-ring flex h-9 w-full items-center justify-center rounded-md border border-transparent focus-visible:ring-2"
              >
                <AgentGlyph
                  appearance={{
                    color: appearance.color,
                    glyph: { kind: tab === "mascots" ? "mascot" : "icon", id },
                  }}
                  size="md"
                />
              </button>
            ))}
          </div>
          {choices.length === 0 && (
            <p className="text-muted-foreground py-4 text-center text-sm">
              No matching glyphs.
            </p>
          )}
        </>
      )}
      <div className="flex items-center justify-between gap-2 border-t pt-2">
        <span className="text-muted-foreground text-xs">
          Saved in this browser · this project
        </span>
        <Button
          text="Reset"
          icon={RotateCcw}
          variant="ghost"
          size="sm"
          onClick={() => reset(projectId, agentName)}
        />
      </div>
    </div>
  );
}

export function AgentAppearancePicker({
  projectId,
  agentName,
}: {
  projectId: string;
  agentName: string;
}) {
  const appearance = useAgentAppearance(projectId, agentName);
  return (
    <PopoverController
      align="start"
      contentClassName="ph-no-capture w-auto p-3"
      disabled={false}
      modal={false}
      renderContent={() => (
        <AppearanceChoices projectId={projectId} agentName={agentName} />
      )}
    >
      {({ Trigger }) => (
        <Trigger asChild>
          <button
            type="button"
            className="ph-no-capture hover:bg-accent focus-visible:ring-ring flex size-9 shrink-0 items-center justify-center rounded-lg border focus-visible:ring-2"
            aria-label={`Customize ${agentName} appearance`}
          >
            <AgentGlyph appearance={appearance} size="md" />
          </button>
        </Trigger>
      )}
    </PopoverController>
  );
}
