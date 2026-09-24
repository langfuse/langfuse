// The tag feature's public client surface (RFC rule 8). Named re-exports
// only. TagList and TagManager are default exports in their own files;
// the door names them, so consumers import them by name.
export { TagButton } from "@/src/features/tag/components/TagButton";
export { default as TagList } from "@/src/features/tag/components/TagList";
export { default as TagManager } from "@/src/features/tag/components/TagManager";
export { TagPromptDetailsPopover } from "@/src/features/tag/components/TagPromptDetailsPopover";
export { TagPromptPopover } from "@/src/features/tag/components/TagPromptPopover";
