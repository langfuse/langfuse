import type { SpielwieseDashboardVM } from "../types/dashboard";
import { getMessageKind } from "./spielwieseMessageTone";

export function createPromptSectionId(
  kind: string,
  sections: SpielwieseDashboardVM["canvas"]["agentNodes"][number]["promptSections"],
) {
  const nextIndex =
    sections.filter(
      (section) => section.id === kind || section.id.startsWith(`${kind}-`),
    ).length + 1;

  return nextIndex === 1 ? kind : `${kind}-${nextIndex}`;
}

function getPromptSectionRank(sectionId: string) {
  const messageKind = getMessageKind(sectionId);

  if (messageKind === "user") {
    return 0;
  }

  return messageKind === "system" ? 1 : 2;
}

export function sortPromptSections(
  sections: SpielwieseDashboardVM["canvas"]["agentNodes"][number]["promptSections"],
) {
  return sections
    .map((section, index) => ({ index, section }))
    .sort((left, right) => {
      const rankDifference =
        getPromptSectionRank(left.section.id) -
        getPromptSectionRank(right.section.id);

      return rankDifference === 0 ? left.index - right.index : rankDifference;
    })
    .map(({ section }) => section);
}

export function movePromptSection(
  sections: SpielwieseDashboardVM["canvas"]["agentNodes"][number]["promptSections"],
  sectionId: string,
  direction: "up" | "down",
) {
  const currentIndex = sections.findIndex(
    (section) => section.id === sectionId,
  );
  const nextIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

  if (currentIndex === -1 || nextIndex < 0 || nextIndex >= sections.length) {
    return sections;
  }

  const nextSections = [...sections];
  const [section] = nextSections.splice(currentIndex, 1);

  if (!section) {
    return sections;
  }

  nextSections.splice(nextIndex, 0, section);
  return nextSections;
}
