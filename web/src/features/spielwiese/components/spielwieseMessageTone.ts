export function getPlaceholderCount(value: string) {
  const placeholderMatches = value.match(/\[[^\]]+\]/g);
  return Math.max(placeholderMatches?.length ?? 0, 1);
}

function getMessageKind(sectionId: string) {
  return sectionId.split("-")[0] ?? sectionId;
}

export { getMessageKind };

export function getMessageToneClassNames(_sectionId: string) {
  const messageKind = getMessageKind(_sectionId);

  if (messageKind === "user") {
    return {
      action:
        "text-foreground/34 hover:bg-muted/48 hover:text-foreground/70 disabled:text-foreground/18 disabled:hover:bg-transparent",
      body: "bg-transparent",
      chip: "border-border/40 bg-background/76 shadow-[inset_0_1px_0_hsl(var(--background)/0.95)] hover:bg-background/88",
      count:
        "text-foreground/38 group-hover:text-foreground/56 group-focus-within:text-foreground/56",
      header: "bg-transparent",
      label: "text-foreground/70",
      field:
        "border-transparent bg-transparent text-foreground placeholder:text-foreground/40 shadow-none focus-visible:border-transparent focus-visible:ring-0",
      surface: "border border-border/40 bg-background/96",
    };
  }

  return {
    action:
      "text-foreground/34 hover:bg-muted/48 hover:text-foreground/70 disabled:text-foreground/18 disabled:hover:bg-transparent",
    body: "bg-transparent",
    chip: "border-border/35 bg-muted/22 hover:bg-muted/30",
    count:
      "text-foreground/38 group-hover:text-foreground/56 group-focus-within:text-foreground/56",
    header: "bg-transparent",
    label: "text-foreground/70",
    surface: "bg-muted/24",
    field:
      "rounded-[10px] border-transparent bg-transparent text-foreground placeholder:text-foreground/46 shadow-none focus-visible:border-transparent focus-visible:ring-0",
  };
}
