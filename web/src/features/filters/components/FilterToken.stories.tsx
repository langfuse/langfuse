import preview from "../../../../.storybook/preview";

import { FilterToken } from "@/src/features/filters/components/FilterToken";

const meta = preview.meta({
  component: FilterToken,
});

export default meta;

export const Default = meta.story({
  args: {
    children: "type:any of GENERATION",
    deactivated: false,
    title: undefined,
  },
});

export const Deactivated = meta.story({
  args: {
    children: "environment:none of development",
    deactivated: true,
    title: "This filter is not applied on this surface",
  },
});
