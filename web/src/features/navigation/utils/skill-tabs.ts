export const SKILL_TABS = {
  VERSIONS: "versions",
} as const;

export type SkillTab = (typeof SKILL_TABS)[keyof typeof SKILL_TABS];

// Skills have no metrics, so the only tab is "versions". The helper is kept for
// consistency with prompt-tabs and so skill-detail can render the tabs bar.
export const getSkillTabs = (projectId: string, skillName: string) => [
  {
    value: SKILL_TABS.VERSIONS,
    label: "Versions",
    href: `/project/${projectId}/skills/${encodeURIComponent(skillName)}`,
  },
];
