import { useState, type ReactNode } from "react";
import { Plus } from "@langfuse/icons";
import { expect } from "storybook/test";

import preview from "../preview";
import { Button } from "../../src/components/design-system/Button/Button";
import { Checkbox } from "../../src/components/design-system/Checkbox/Checkbox";
import { CopyInput } from "../../src/components/design-system/CopyInput/CopyInput";
import { DateRangeInput } from "../../src/components/design-system/DateRangeInput/DateRangeInput";
import { IconButton } from "../../src/components/design-system/IconButton/IconButton";
import { Input } from "../../src/components/design-system/Input/Input";
import { MultiSelectInput } from "../../src/components/design-system/MultiSelectInput/MultiSelectInput";
import { PasswordInput } from "../../src/components/design-system/PasswordInput/PasswordInput";
import {
  QueryInput,
  useQueryInputController,
} from "../../src/components/design-system/QueryInput/QueryInput";
import { Radio } from "../../src/components/design-system/Radio/Radio";
import { SearchInput } from "../../src/components/design-system/SearchInput/SearchInput";
import { SelectInput } from "../../src/components/design-system/SelectInput/SelectInput";
import { Switch } from "../../src/components/design-system/Switch/Switch";
import { SwitchInput } from "../../src/components/design-system/SwitchInput/SwitchInput";
import { Tabs } from "../../src/components/design-system/Tabs/Tabs";
import { Toggle } from "../../src/components/design-system/Toggle/Toggle";

const meta = preview.meta({
  // Docs-only backing stories for FormElements.mdx. Indexed for Canvas and
  // play tests, hidden from the sidebar.
  tags: ["!dev"],
});

const selectOptions = [
  { value: "one", label: "One" },
  { value: "two", label: "Two" },
];

function Field({
  name,
  label,
  children,
}: {
  name: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex w-44 flex-col gap-1">
      <span className="text-muted-foreground text-xs">{label}</span>
      <div data-form-control={name}>{children}</div>
    </div>
  );
}

function Row({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div data-form-row={name} className="flex flex-wrap items-end gap-3">
      {children}
    </div>
  );
}

function InsetTabs({ size }: { size: "sm" | "md" }) {
  return (
    <Tabs defaultValue="one">
      <Tabs.List variant="inset" size={size} aria-label="Example">
        <Tabs.Trigger value="one" label="One" />
        <Tabs.Trigger value="two" label="Two" />
      </Tabs.List>
    </Tabs>
  );
}

function QueryField({ size }: { size: "default" | "large" }) {
  const controller = useQueryInputController();
  return (
    <QueryInput
      label="Query"
      value=""
      diagnostics={[]}
      tokens={[]}
      placeholder="Filter"
      size={size}
      onValueChange={() => undefined}
      onCommit={() => null}
      onRemoveToken={() => undefined}
      areEquivalent={() => true}
      controller={controller}
      completions={null}
    />
  );
}

function StandardControls() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("one");
  const [multi, setMulti] = useState<string[]>([]);

  return (
    <Row name="standard">
      <Field name="input" label="Input">
        <Input aria-label="Input" placeholder="Input" />
      </Field>
      <Field name="password" label="PasswordInput">
        <PasswordInput aria-label="Password" placeholder="Password" />
      </Field>
      <Field name="copy" label="CopyInput">
        <CopyInput
          aria-label="Copy value"
          value="langfuse"
          copyLabel="Copy"
          clipboard={{
            copy: async () => undefined,
            copyStatus: { kind: "idle" },
          }}
        />
      </Field>
      <Field name="search" label="SearchInput">
        <SearchInput
          value={query}
          onChange={setQuery}
          onSubmit={() => undefined}
          placeholder="Search"
        />
      </Field>
      <Field name="select" label="SelectInput">
        <SelectInput
          aria-label="Select"
          value={selected}
          options={selectOptions}
          onValueChange={setSelected}
          placeholder="Select"
        />
      </Field>
      <Field name="multiselect" label="MultiSelectInput">
        <MultiSelectInput
          aria-label="Multi select"
          value={multi}
          options={selectOptions}
          onValueChange={setMulti}
          placeholder="Select"
          selectedLabel="Selected"
          searchPlaceholder="Search"
          emptyMessage="None"
        />
      </Field>
      <Field name="date" label="DateRangeInput">
        <DateRangeInput
          value="7d"
          customValue="custom"
          presets={[{ value: "7d", label: "Last 7 days" }]}
          onPresetChange={() => undefined}
          onCustomChange={() => undefined}
        />
      </Field>
      <Field name="query" label="QueryInput">
        <QueryField size="default" />
      </Field>
      <Field name="button" label="Button">
        <Button variant="outline" text="Button" />
      </Field>
      <Field name="icon" label="IconButton">
        <IconButton icon={Plus} label="Add" size="md" variant="outline" />
      </Field>
      <Field name="tabs" label="Tabs inset">
        <InsetTabs size="md" />
      </Field>
      <Field name="toggle" label="Toggle">
        <Toggle>Aa</Toggle>
      </Field>
    </Row>
  );
}

function measuredHeight(row: Element, name: string) {
  const cell = row.querySelector(`[data-form-control="${name}"]`);
  const target = cell?.firstElementChild;
  if (!(target instanceof HTMLElement)) {
    throw new TypeError(`No control rendered for ${name}`);
  }
  return Math.round(target.getBoundingClientRect().height);
}

export const StandardSize = meta.story({
  name: "Standard size",
  render: () => <StandardControls />,
});

export const StandardHeight = meta.story({
  name: "(Test) Standard height",
  render: () => <StandardControls />,
  play: async ({ canvasElement }) => {
    const row = canvasElement.querySelector('[data-form-row="standard"]');
    if (!row) throw new Error("Missing standard row");

    const names = [
      "input",
      "password",
      "copy",
      "search",
      "select",
      "multiselect",
      "date",
      "button",
      "icon",
      "tabs",
      "toggle",
      "query",
    ] as const;
    const heights = names.map((name) => measuredHeight(row, name));
    expect(new Set(heights)).toEqual(new Set([32]));
  },
});

export const Sizes = meta.story({
  name: "Sizes",
  render: function SizesGallery() {
    const [query, setQuery] = useState("");
    return (
      <div className="flex flex-col gap-6">
        <Row name="button-sizes">
          <Field name="button-default" label="Button default">
            <Button variant="outline" text="Button" />
          </Field>
          <Field name="button-sm" label="Button sm">
            <Button variant="outline" size="sm" text="Button" />
          </Field>
        </Row>
        <Row name="icon-sizes">
          <Field name="icon-md" label="IconButton md">
            <IconButton icon={Plus} label="Add" size="md" variant="outline" />
          </Field>
          <Field name="icon-sm" label="IconButton sm">
            <IconButton icon={Plus} label="Add" size="sm" variant="outline" />
          </Field>
          <Field name="icon-xs" label="IconButton xs">
            <IconButton icon={Plus} label="Add" size="xs" variant="outline" />
          </Field>
        </Row>
        <Row name="search-sizes">
          <Field name="search-default" label="SearchInput default">
            <SearchInput
              value={query}
              onChange={setQuery}
              onSubmit={() => undefined}
              placeholder="Search"
            />
          </Field>
          <Field name="search-large" label="SearchInput large">
            <SearchInput
              value={query}
              onChange={setQuery}
              onSubmit={() => undefined}
              placeholder="Search"
              size="large"
            />
          </Field>
        </Row>
        <Row name="tabs-sizes">
          <Field name="tabs-md" label="Tabs inset md">
            <InsetTabs size="md" />
          </Field>
          <Field name="tabs-sm" label="Tabs inset sm">
            <InsetTabs size="sm" />
          </Field>
          <Field name="tabs-underline" label="Tabs underline">
            <Tabs defaultValue="one">
              <Tabs.List variant="underline" aria-label="Underline">
                <Tabs.Trigger value="one" label="One" />
                <Tabs.Trigger value="two" label="Two" />
              </Tabs.List>
            </Tabs>
          </Field>
        </Row>
        <Row name="query-sizes">
          <Field name="query-default" label="QueryInput default">
            <QueryField size="default" />
          </Field>
          <Field name="query-large" label="QueryInput large">
            <QueryField size="large" />
          </Field>
        </Row>
      </div>
    );
  },
});

export const SmallRow = meta.story({
  name: "Small row",
  render: () => (
    <Row name="small">
      <Field name="button" label="Button sm">
        <Button variant="outline" size="sm" text="Button" />
      </Field>
      <Field name="icon" label="IconButton sm">
        <IconButton icon={Plus} label="Add" size="sm" variant="outline" />
      </Field>
      <Field name="tabs" label="Tabs inset sm">
        <InsetTabs size="sm" />
      </Field>
    </Row>
  ),
});

export const LargeRow = meta.story({
  name: "Large row",
  render: function LargeGallery() {
    const [query, setQuery] = useState("");
    return (
      <Row name="large">
        <Field name="search" label="SearchInput large">
          <SearchInput
            value={query}
            onChange={setQuery}
            onSubmit={() => undefined}
            placeholder="Search"
            size="large"
          />
        </Field>
        <Field name="tabs" label="Tabs underline">
          <Tabs defaultValue="one">
            <Tabs.List variant="underline" aria-label="Underline">
              <Tabs.Trigger value="one" label="One" />
              <Tabs.Trigger value="two" label="Two" />
            </Tabs.List>
          </Tabs>
        </Field>
        <Field name="query" label="QueryInput large">
          <QueryField size="large" />
        </Field>
      </Row>
    );
  },
});

export const LargeHeight = meta.story({
  name: "(Test) Large height",
  render: function LargeHeightGallery() {
    const [query, setQuery] = useState("");
    return (
      <Row name="large">
        <Field name="search" label="SearchInput large">
          <SearchInput
            value={query}
            onChange={setQuery}
            onSubmit={() => undefined}
            placeholder="Search"
            size="large"
          />
        </Field>
        <Field name="tabs" label="Tabs underline">
          <Tabs defaultValue="one">
            <Tabs.List variant="underline" aria-label="Underline">
              <Tabs.Trigger value="one" label="One" />
              <Tabs.Trigger value="two" label="Two" />
            </Tabs.List>
          </Tabs>
        </Field>
      </Row>
    );
  },
  play: async ({ canvasElement }) => {
    const row = canvasElement.querySelector('[data-form-row="large"]');
    if (!row) throw new Error("Missing large row");
    const heights = ["search", "tabs"].map((name) => measuredHeight(row, name));
    expect(new Set(heights)).toEqual(new Set([36]));
  },
});

export const Indicators = meta.story({
  name: "Indicators",
  render: () => (
    <Row name="indicators">
      <Field name="checkbox" label="Checkbox">
        <Checkbox aria-label="Checkbox" />
      </Field>
      <Field name="checkbox-sm" label="Checkbox sm">
        <Checkbox aria-label="Small checkbox" size="sm" />
      </Field>
      <Field name="radio" label="Radio">
        <Radio aria-label="Radio" name="form-elements-radio" />
      </Field>
      <Field name="switch" label="Switch">
        <Switch aria-label="Switch" />
      </Field>
      <Field name="switch-sm" label="Switch sm">
        <Switch aria-label="Small switch" size="sm" />
      </Field>
      <Field name="switch-input" label="SwitchInput">
        <SwitchInput id="form-elements-switch" description="Enabled" />
      </Field>
    </Row>
  ),
});
