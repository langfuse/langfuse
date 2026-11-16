import { type EntityTitleTabsProps } from "@/src/components/EntityTitleTabs";

export function getTraceScopeTabs({
  value,
  canSelectSession,
  onValueChange,
}: {
  value: "trace" | "session";
  canSelectSession: boolean;
  onValueChange: (value: "trace" | "session") => void;
}): EntityTitleTabsProps {
  return {
    label: "Trace detail scope",
    value,
    options: [
      { value: "trace", label: "Trace", itemType: "TRACE" },
      {
        value: "session",
        label: "Session",
        itemType: "SESSION",
        disabled: !canSelectSession,
        disabledReason:
          "Session view requires project access and a trace belonging to a session.",
      },
    ],
    onValueChange: (next) => {
      if (next === "trace" || next === "session") onValueChange(next);
    },
  };
}
