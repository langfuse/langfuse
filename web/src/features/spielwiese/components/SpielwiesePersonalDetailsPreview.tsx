function OnboardingPreviewSidebarIcon({ active }: { active?: boolean }) {
  const labelClassName = active
    ? "w-20 bg-[rgb(36,37,41)]/80"
    : "w-16 bg-[rgba(0,0,0,0.4)]/25";

  return (
    <div
      className={`flex h-7 items-center gap-2 rounded-[10px] px-2.5 ${active ? "bg-[rgb(248,249,250)]" : "bg-transparent"}`}
    >
      <span className="size-3.5 rounded-[4px] bg-[rgb(205,207,209)]" />
      <span className={`h-2 rounded-full ${labelClassName}`} />
    </div>
  );
}

const previewCellBlueprint = [
  { fillTone: "header", id: "header-name", widthClassName: "w-16" },
  { fillTone: "header", id: "header-owner", widthClassName: "w-12" },
  { fillTone: "header", id: "header-stage", widthClassName: "w-10" },
  { fillTone: "header", id: "header-status", widthClassName: "w-12" },
  { fillTone: "header", id: "header-score", widthClassName: "w-8" },
  { fillTone: "accent", id: "row-1-name", widthClassName: "w-20" },
  { fillTone: "body", id: "row-1-owner", widthClassName: "w-14" },
  { fillTone: "body", id: "row-1-stage", widthClassName: "w-10" },
  { fillTone: "body", id: "row-1-status", widthClassName: "w-16" },
  { fillTone: "body", id: "row-1-score", widthClassName: "w-8" },
  { fillTone: "body", id: "row-2-name", widthClassName: "w-18" },
  { fillTone: "body", id: "row-2-owner", widthClassName: "w-12" },
  { fillTone: "body", id: "row-2-stage", widthClassName: "w-9" },
  { fillTone: "body", id: "row-2-status", widthClassName: "w-14" },
  { fillTone: "body", id: "row-2-score", widthClassName: "w-10" },
  { fillTone: "body", id: "row-3-name", widthClassName: "w-16" },
  { fillTone: "body", id: "row-3-owner", widthClassName: "w-14" },
  { fillTone: "body", id: "row-3-stage", widthClassName: "w-12" },
  { fillTone: "body", id: "row-3-status", widthClassName: "w-10" },
  { fillTone: "body", id: "row-3-score", widthClassName: "w-9" },
  { fillTone: "body", id: "row-4-name", widthClassName: "w-20" },
  { fillTone: "body", id: "row-4-owner", widthClassName: "w-12" },
  { fillTone: "body", id: "row-4-stage", widthClassName: "w-8" },
  { fillTone: "body", id: "row-4-status", widthClassName: "w-16" },
  { fillTone: "body", id: "row-4-score", widthClassName: "w-10" },
] as const;

function getPreviewCellFillClassName(fillTone: "accent" | "body" | "header") {
  if (fillTone === "header") {
    return "bg-[rgba(0,0,0,0.4)]/22";
  }

  if (fillTone === "accent") {
    return "bg-[rgb(224,252,237)]";
  }

  return "bg-[rgba(0,0,0,0.4)]/16";
}

function PreviewGrid() {
  return (
    <div className="grid grid-cols-[1.1fr_0.9fr_0.7fr_0.8fr_0.6fr] overflow-hidden rounded-[12px] border border-[rgb(238,239,241)]">
      {previewCellBlueprint.map(({ fillTone, id, widthClassName }, index) => {
        const isHeader = fillTone === "header";
        const isColumnEnd = index % 5 === 4;
        const isLastRow = index >= previewCellBlueprint.length - 5;
        const fillClassName = getPreviewCellFillClassName(fillTone);

        return (
          <div
            key={id}
            className={`flex h-10 items-center border-r border-b border-[rgb(238,239,241)] px-3 ${isHeader ? "bg-[rgb(251,251,251)]" : "bg-white"} ${isColumnEnd ? "border-r-0" : ""} ${isLastRow ? "border-b-0" : ""}`}
          >
            <div
              className={`h-2.5 rounded-full ${widthClassName} ${fillClassName}`}
            />
          </div>
        );
      })}
    </div>
  );
}

export default function SpielwiesePersonalDetailsPreview() {
  return (
    <div className="flex min-h-[43.125rem] overflow-hidden bg-white">
      <div className="flex h-full w-full overflow-hidden border-l border-[rgb(238,239,241)] bg-white">
        <div className="flex w-[12rem] flex-col gap-2 border-r border-[rgba(0,0,0,0.05)] bg-[rgb(251,251,251)] px-3 py-4">
          <div className="flex items-center gap-2.5 rounded-[12px] px-2 py-1.5">
            <div className="grid size-8 place-content-center rounded-full bg-[rgb(38,109,240)] text-sm/none font-semibold tracking-[-0.02em] text-[rgb(229,238,255)]">
              A
            </div>
            <div className="grid gap-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[0.8125rem]/4 font-medium tracking-[-0.01em] text-[rgb(36,37,41)]">
                  Workspace
                </span>
                <span className="size-2 rounded-full bg-[rgb(0,209,126)]" />
              </div>
              <div className="h-2 w-10 rounded-full bg-[rgb(205,207,209)]" />
            </div>
          </div>
          <div className="grid gap-1 pt-2">
            <OnboardingPreviewSidebarIcon />
            <OnboardingPreviewSidebarIcon />
            <OnboardingPreviewSidebarIcon active />
            <OnboardingPreviewSidebarIcon />
            <OnboardingPreviewSidebarIcon />
            <OnboardingPreviewSidebarIcon />
          </div>
        </div>
        <div className="flex flex-1 flex-col bg-white">
          <div className="border-b border-[rgb(238,239,241)] px-5 py-4">
            <div className="h-3 w-28 rounded-full bg-[rgb(36,37,41)]/80" />
          </div>
          <div className="grid flex-1 gap-3 px-5 py-4">
            <PreviewGrid />
          </div>
        </div>
      </div>
    </div>
  );
}
