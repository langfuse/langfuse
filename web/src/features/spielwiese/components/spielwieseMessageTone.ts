export function getPlaceholderCount(value: string) {
  const placeholderMatches = value.match(/\[[^\]]+\]/g);
  return Math.max(placeholderMatches?.length ?? 0, 1);
}

function getMessageKind(sectionId: string) {
  return sectionId.split("-")[0] ?? sectionId;
}

export { getMessageKind };

export function getMessageToneClassNames(sectionId: string) {
  const messageKind = getMessageKind(sectionId);

  if (messageKind === "user") {
    return {
      action:
        "text-foreground/42 hover:bg-foreground/5 hover:text-foreground/70",
      body: "bg-light-blue/58",
      count:
        "text-foreground/50 group-hover:text-foreground/70 group-focus-within:text-foreground/70",
      label: "text-dark-blue",
      field:
        "border-transparent bg-transparent text-foreground placeholder:text-foreground/45 shadow-none focus-visible:border-transparent focus-visible:ring-0",
      header: "bg-light-blue/58",
    };
  }

  if (messageKind === "assistant") {
    return {
      action:
        "text-foreground/42 hover:bg-foreground/5 hover:text-foreground/70",
      body: "bg-light-red/58",
      count:
        "text-foreground/50 group-hover:text-foreground/70 group-focus-within:text-foreground/70",
      label: "text-dark-red",
      field:
        "border-transparent bg-transparent text-foreground placeholder:text-foreground/45 shadow-none focus-visible:border-transparent focus-visible:ring-0",
      header: "bg-light-red/58",
    };
  }

  if (messageKind === "tool") {
    return {
      action:
        "text-foreground/42 hover:bg-foreground/5 hover:text-foreground/70",
      body: "bg-light-yellow/58",
      count:
        "text-foreground/50 group-hover:text-foreground/70 group-focus-within:text-foreground/70",
      label: "text-dark-yellow",
      field:
        "border-transparent bg-transparent text-foreground placeholder:text-foreground/45 shadow-none focus-visible:border-transparent focus-visible:ring-0",
      header: "bg-light-yellow/58",
    };
  }

  return {
    action: "text-foreground/42 hover:bg-foreground/5 hover:text-foreground/70",
    body: "bg-accent-light-blue/58",
    count:
      "text-foreground/50 group-hover:text-foreground/70 group-focus-within:text-foreground/70",
    label: "text-accent-dark-blue",
    field:
      "border-transparent bg-transparent text-foreground placeholder:text-foreground/45 shadow-none focus-visible:border-transparent focus-visible:ring-0",
    header: "bg-accent-light-blue/58",
  };
}
