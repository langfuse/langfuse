// The tag feature's public client surface (RFC rule 8). Named re-exports
// only. TagList and TagManager are default exports in their own files;
// the door names them, so consumers import them by name.
export { TagButton } from "@/src/app/tables/tagging/components/TagButton";
export { default as TagList } from "@/src/app/tables/tagging/components/TagList";
export { default as TagManager } from "@/src/app/tables/tagging/components/TagManager";
export { TagPromptDetailsPopover } from "@/src/app/tables/tagging/components/TagPromptDetailsPopover";
export { TagPromptPopover } from "@/src/app/tables/tagging/components/TagPromptPopover";
