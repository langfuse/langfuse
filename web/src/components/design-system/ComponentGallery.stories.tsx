import React from "react";
import { AlertCircle, Info, Plus } from "lucide-react";
import preview from "../../../.storybook/preview";

import { Button, type ButtonProps } from "@/src/components/ui/button";
import { Badge, type BadgeProps } from "@/src/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { Callout } from "@/src/components/ui/callout";
import { Input } from "@/src/components/ui/input";
import { Textarea } from "@/src/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { Checkbox } from "@/src/components/ui/checkbox";
import { Switch } from "@/src/components/design-system/Switch/Switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/src/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { ItemBadge, type LangfuseItemType } from "@/src/components/ItemBadge";
import { EXPERIMENT_COLOR_STYLES } from "@/src/features/experiments/components/table/types";

/**
 * Design-system gallery: the key primitives rendered in all their variants on
 * one scannable page, so light/dark rendering can be audited with the global
 * Theme toolbar toggle. Everything is the real component, imported from the
 * app — no copies.
 *
 * Deliberately skipped (need heavy context or fight the gallery layout):
 * - DataTable and any component needing tRPC/router/session context.
 * - Recharts charts — heavy; the chart palette is covered as swatches in
 *   "Design System/Theme Tokens" (a dedicated chart story can come later).
 * - Dialog / DropdownMenu / Popover / Sheet — transient overlays; stacking is
 *   documented in "Design System/Overlay Layers". Tooltip is included
 *   statically open since it stays anchored to its trigger.
 *
 * Known/expected: ItemBadge observation-type icon colors (text-purple-600
 * etc.) have no dark: variants — flagged by the dark-theme audit, rendered
 * here as-is on purpose. Same for the experiments "text-dark-gray" baseline
 * class, which has no backing token.
 */

const BUTTON_VARIANTS: ButtonProps["variant"][] = [
  "default",
  "destructive",
  "destructive-secondary",
  "outline",
  "secondary",
  "tertiary",
  "ghost",
  "link",
  "errorNotification",
];

const BUTTON_TEXT_SIZES: ButtonProps["size"][] = ["xs", "sm", "default", "lg"];
const BUTTON_ICON_SIZES: ButtonProps["size"][] = ["icon-xs", "icon-sm", "icon"];

const BADGE_VARIANTS: BadgeProps["variant"][] = [
  "default",
  "secondary",
  "destructive",
  "outline",
  "outline-solid",
  "tertiary",
  "success",
  "error",
  "warning",
];

const ITEM_BADGE_TYPES: LangfuseItemType[] = [
  "TRACE",
  "GENERATION",
  "EVENT",
  "SPAN",
  "AGENT",
  "TOOL",
  "CHAIN",
  "RETRIEVER",
  "EMBEDDING",
  "GUARDRAIL",
  "SESSION",
  "USER",
  "QUEUE_ITEM",
  "DATASET",
  "DATASET_RUN",
  "DATASET_ITEM",
  "ANNOTATION_QUEUE",
  "PROMPT",
  "EVALUATOR",
  "RUNNING_EVALUATOR",
  "EXPERIMENT",
];

const EXPERIMENT_STYLE_LABELS = [
  "Baseline",
  "Comparison 1",
  "Comparison 2",
  "Comparison 3",
  "Comparison 4",
];

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <h2 className="text-foreground text-lg font-bold">{title}</h2>
      {note && <p className="text-muted-foreground mt-1 text-xs">{note}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Row({
  label,
  children,
}: {
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-3">
      {label && (
        <span className="text-muted-foreground w-24 shrink-0 font-mono text-[11px]">
          {label}
        </span>
      )}
      {children}
    </div>
  );
}

function ComponentGalleryDoc() {
  return (
    <div className="text-foreground mx-auto max-w-5xl p-8 text-sm leading-relaxed">
      <h1 className="text-2xl font-bold">Component gallery</h1>
      <p className="text-muted-foreground mt-1">
        Key primitives in all their variants — flip the Theme toolbar toggle to
        audit light and dark rendering.
      </p>

      <Section title="Button" note="All variants at default size, then sizes.">
        <Row label="variants">
          {BUTTON_VARIANTS.map((variant) => (
            <Button key={variant} variant={variant}>
              {variant}
            </Button>
          ))}
        </Row>
        <Row label="sizes">
          {BUTTON_TEXT_SIZES.map((size) => (
            <Button key={size} size={size}>
              {size}
            </Button>
          ))}
          {BUTTON_ICON_SIZES.map((size) => (
            <Button key={size} size={size} aria-label={`icon button ${size}`}>
              <Plus className="h-4 w-4" />
            </Button>
          ))}
        </Row>
        <Row label="states">
          <Button disabled>disabled</Button>
          <Button loading>loading</Button>
        </Row>
      </Section>

      <Section title="Badge">
        <Row label="default">
          {BADGE_VARIANTS.map((variant) => (
            <Badge key={variant} variant={variant}>
              {variant}
            </Badge>
          ))}
        </Row>
        <Row label="sm">
          {BADGE_VARIANTS.map((variant) => (
            <Badge key={variant} variant={variant} size="sm">
              {variant}
            </Badge>
          ))}
        </Row>
      </Section>

      <Section
        title="ItemBadge"
        note="One badge per entity type. The observation-type icon colors (AGENT…GUARDRAIL) intentionally have no dark: variants yet — audit finding, rendered as-is."
      >
        <div className="flex flex-wrap gap-2">
          {ITEM_BADGE_TYPES.map((type) => (
            <ItemBadge key={type} type={type} showLabel />
          ))}
        </div>
      </Section>

      <Section title="Alert & Callout">
        <div className="flex max-w-2xl flex-col gap-3">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Default alert</AlertTitle>
            <AlertDescription>
              Neutral information on the page surface.
            </AlertDescription>
          </Alert>
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Destructive alert</AlertTitle>
            <AlertDescription>Something went wrong.</AlertDescription>
          </Alert>
          <Alert variant="info">
            <Info className="h-4 w-4" />
            <AlertTitle>Info alert</AlertTitle>
            <AlertDescription>Blue informational surface.</AlertDescription>
          </Alert>
          {/* Callout persists dismissal in localStorage (30d TTL) — if one is
              missing here, clear the "storybook-gallery-*" keys. */}
          <Callout id="storybook-gallery-info" variant="info">
            Info callout — dismissible, light-blue surface.
          </Callout>
          <Callout id="storybook-gallery-warning" variant="warning">
            Warning callout — dismissible, light-yellow surface.
          </Callout>
        </div>
      </Section>

      <Section title="Form controls">
        <div className="grid max-w-2xl grid-cols-2 gap-4">
          <Input placeholder="Input placeholder" aria-label="Example input" />
          <Input
            defaultValue="Disabled input"
            disabled
            aria-label="Disabled input"
          />
          <Textarea
            placeholder="Textarea placeholder"
            aria-label="Example textarea"
          />
          <Select>
            <SelectTrigger aria-label="Example select">
              <SelectValue placeholder="Select an option" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="one">Option one</SelectItem>
              <SelectItem value="two">Option two</SelectItem>
              <SelectItem value="three">Option three</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Row label="checkbox">
          <Checkbox aria-label="Unchecked" />
          <Checkbox defaultChecked aria-label="Checked" />
          <Checkbox disabled aria-label="Disabled" />
          <Checkbox defaultChecked disabled aria-label="Checked disabled" />
        </Row>
        <Row label="switch">
          <Switch aria-label="Off" />
          <Switch defaultChecked aria-label="On" />
          <Switch disabled aria-label="Disabled" />
          <Switch defaultChecked disabled aria-label="On disabled" />
        </Row>
      </Section>

      <Section title="Card">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Card title</CardTitle>
            <CardDescription>Card description in muted text.</CardDescription>
          </CardHeader>
          <CardContent>
            Card content on the card surface — check the border and background
            separation against the page in both themes.
          </CardContent>
          <CardFooter className="gap-2">
            <Button size="sm">Confirm</Button>
            <Button size="sm" variant="ghost">
              Cancel
            </Button>
          </CardFooter>
        </Card>
      </Section>

      <Section title="Tabs">
        <Tabs defaultValue="first" className="max-w-md">
          <TabsList>
            <TabsTrigger value="first">First</TabsTrigger>
            <TabsTrigger value="second">Second</TabsTrigger>
            <TabsTrigger value="third" disabled>
              Disabled
            </TabsTrigger>
          </TabsList>
          <TabsContent value="first">
            Content of the first tab — active trigger vs. inactive contrast.
          </TabsContent>
          <TabsContent value="second">Content of the second tab.</TabsContent>
        </Tabs>
      </Section>

      <Section
        title="Tooltip"
        note="Statically open so the popover surface is scannable without hovering."
      >
        <div className="flex h-20 items-end">
          <Tooltip open>
            <TooltipTrigger asChild>
              <Button variant="outline">Tooltip anchor</Button>
            </TooltipTrigger>
            <TooltipContent>Tooltip surface (bg-popover)</TooltipContent>
          </Tooltip>
        </div>
      </Section>

      <Section
        title="Experiment colors"
        note="EXPERIMENT_COLOR_STYLES from the experiments table — badge, marker, and text class per slot."
      >
        <div className="flex flex-col gap-2">
          {EXPERIMENT_COLOR_STYLES.map((style, i) => (
            <div key={i} className="flex items-center gap-3">
              <span
                className={`inline-block h-3 w-3 rounded-full ${style.markerClass}`}
              />
              <span
                className={`rounded-md border px-2 py-0.5 text-xs font-bold ${style.badgeClass}`}
              >
                {EXPERIMENT_STYLE_LABELS[i]}
              </span>
              <span className={`text-xs ${style.textClass}`}>
                {style.textClass}
              </span>
            </div>
          ))}
        </div>
      </Section>

      <p className="text-muted-foreground mt-10 border-t pt-4 text-xs">
        Part of the design system. Companion pages: &ldquo;Theme Tokens&rdquo;
        (raw palette) and &ldquo;Overlay Layers&rdquo; (stacking).
      </p>
    </div>
  );
}

const meta = preview.meta({
  title: "Design System/Component Gallery",
  component: ComponentGalleryDoc,
  parameters: { layout: "fullscreen" },
});

export const Overview = meta.story({});
