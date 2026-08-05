/**
 * Storybook-only badge & tag reference (Design → Badges & tags): every
 * badge-like surface in the app, rendered live from its real component in
 * both themes, with a one-line "rides" note naming the tokens under it.
 *
 * Specimens are imports, never re-implementations, so the page cannot drift
 * from the components. Token names in prose use the role vocabulary
 * (danger/warning/success/info + -tint, brand, score-*) from globals.css.
 */
import { type ReactNode } from "react";

import { EnvLabelBadge } from "@/src/components/EnvLabelBadge";
import { iconMap, ItemBadge } from "@/src/components/ItemBadge";
import { getLevelColors, LevelColors } from "@/src/components/level-colors";
import {
  SCORE_LEVEL_LABELS,
  ScoreTag,
  type ScoreLevel,
} from "@/src/components/score-tag";
import { Badge, type BadgeProps } from "@/src/components/ui/badge";
import { StatusBadge } from "@/src/components/ui/StatusBadge/StatusBadge";
import { TagButton } from "@/src/features/tag/components/TagButton";
import { cn } from "@/src/utils/tailwind";

import {
  DocsPageHeader as PageHeader,
  DocsSection as PageSection,
  Eyebrow,
  SpecChip as InlineCode,
} from "../ThemeTokens/docsChrome";

/* ------------------------------------------------------------------------- *
 * Page chrome: every specimen renders twice, side by side — left pane follows
 * the toolbar theme, right pane is pinned dark via the `.dark` class (the
 * class-based theming re-scopes every token underneath it).
 * ------------------------------------------------------------------------- */

function SpecimenDuo({ children }: { children: ReactNode }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {(["light", "dark"] as const).map((mode) => (
        <div key={mode} className="flex flex-col gap-1.5">
          <Eyebrow>{mode}</Eyebrow>
          <div
            className={cn(
              "bg-canvas text-foreground flex flex-col gap-3 rounded-md border p-4",
              mode === "dark" && "dark",
            )}
          >
            {children}
          </div>
        </div>
      ))}
    </div>
  );
}

/** One flex-wrap row of specimens inside a SpecimenDuo pane. */
function Row({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>;
}

/** The one-line token note under a section: what the specimens ride on. */
function Rides({ children }: { children: ReactNode }) {
  return (
    <p className="text-tertiary text-sm">
      <span className="text-foreground font-bold">Rides</span> {children}
    </p>
  );
}

/* ------------------------------------------------------------------------- *
 * Badge (ui/badge.tsx). Typed against the component's own variant union, so
 * adding a cva variant without documenting it here fails the type-check.
 * ------------------------------------------------------------------------- */

const BADGE_VARIANTS: Record<NonNullable<BadgeProps["variant"]>, string> = {
  default: "solid primary fill — the loud default",
  secondary: "muted fill — quiet counts and metadata",
  tertiary: "muted-gray fill — tag-like neutral chip",
  outline: "text-only ghost — the border is transparent despite the name",
  "outline-solid": "input-style border on canvas — the real outlined chip",
  destructive: "solid destructive fill — irreversible-action contexts",
  success: "status tint — positive state",
  error: "status tint — failure state",
  warning: "status tint — needs attention",
};

const BADGE_VARIANT_NAMES = Object.keys(BADGE_VARIANTS) as Array<
  NonNullable<BadgeProps["variant"]>
>;

function BadgeSection() {
  return (
    <PageSection
      title="Badge"
      blurb="The base label chip. success / error / warning / destructive carry semantic status; the rest are decorative emphasis levels."
      aside={<InlineCode>{BADGE_VARIANT_NAMES.length} variants</InlineCode>}
    >
      <SpecimenDuo>
        <Row>
          {BADGE_VARIANT_NAMES.map((variant) => (
            <Badge
              key={variant}
              variant={variant}
              title={BADGE_VARIANTS[variant]}
            >
              {variant}
            </Badge>
          ))}
          <Badge variant="secondary" size="sm">
            size sm
          </Badge>
        </Row>
        {/* Badge renders a <div>, so the sentence wrapper cannot be a <p>. */}
        <div className="text-sm">
          In a sentence: prompt{" "}
          <Badge variant="secondary" size="sm">
            v3
          </Badge>{" "}
          is{" "}
          <Badge variant="success" size="sm">
            active
          </Badge>{" "}
          in{" "}
          <Badge variant="tertiary" size="sm">
            production
          </Badge>
          .
        </div>
      </SpecimenDuo>
      <Rides>
        the status pairs — <InlineCode>success-tint + success</InlineCode>,{" "}
        <InlineCode>danger-tint + danger</InlineCode>,{" "}
        <InlineCode>warning-tint + warning</InlineCode> (tint fill, strong
        text); <InlineCode>default</InlineCode> rides the primary fill,{" "}
        <InlineCode>secondary / tertiary</InlineCode> the muted fills.
      </Rides>
      <p className="text-tertiary text-sm">
        Known offender: <InlineCode>MonitorSeverityBadge</InlineCode> restates
        raw emerald/amber/orange on top of Badge — it should become the{" "}
        <InlineCode>success / warning / error</InlineCode> variants riding the
        status tokens.
      </p>
    </PageSection>
  );
}

/* ------------------------------------------------------------------------- *
 * StatusBadge (ui/StatusBadge). Lifecycle status with a live-pulse dot.
 * ------------------------------------------------------------------------- */

const STATUS_SPECIMENS = [
  "active",
  "pending",
  "delayed",
  "paused",
  "inactive",
  "completed",
  "error",
] as const;

function StatusesSection() {
  return (
    <PageSection
      title="Statuses"
      blurb="Lifecycle status with a live-pulse dot; the category (and color) is inferred from the status string."
      aside={<InlineCode>{STATUS_SPECIMENS.length} categories</InlineCode>}
    >
      <SpecimenDuo>
        <Row>
          {STATUS_SPECIMENS.map((status) => (
            <StatusBadge key={status} type={status} />
          ))}
        </Row>
      </SpecimenDuo>
      <Rides>
        the same status pairs as Badge — <InlineCode>success</InlineCode> for
        active/completed, <InlineCode>warning</InlineCode> for pending/paused,{" "}
        <InlineCode>info</InlineCode> for delayed,{" "}
        <InlineCode>danger</InlineCode> for error — plus{" "}
        <InlineCode>muted-gray</InlineCode> for inactive.
      </Rides>
    </PageSection>
  );
}

/* ------------------------------------------------------------------------- *
 * ItemBadge: observation-type / entity identity badges.
 * ------------------------------------------------------------------------- */

const ITEM_TYPE_SPECIMENS = [
  "TRACE",
  "GENERATION",
  "SPAN",
  "EVENT",
  "AGENT",
  "TOOL",
  "GUARDRAIL",
  "DATASET",
] as const;

function ObservationTypesSection() {
  return (
    <PageSection
      title="Observation types"
      blurb="Identity badge for observations and entities: outline chip, icon in the type's identity color, optional label."
      aside={<InlineCode>{Object.keys(iconMap).length} types</InlineCode>}
    >
      <SpecimenDuo>
        <Row>
          {ITEM_TYPE_SPECIMENS.map((type) => (
            <ItemBadge key={type} type={type} />
          ))}
        </Row>
        <Row>
          {ITEM_TYPE_SPECIMENS.slice(0, 5).map((type) => (
            <ItemBadge key={type} type={type} showLabel />
          ))}
        </Row>
      </SpecimenDuo>
      <Rides>
        <InlineCode>icon-obs-*</InlineCode> identity colors on a{" "}
        <InlineCode>bg-canvas</InlineCode> outline — the icon shape is the
        primary identity; full token table in Design → Color → Observation
        types.
      </Rides>
    </PageSection>
  );
}

/* ------------------------------------------------------------------------- *
 * ScoreTag: the global score-level color coding.
 * ------------------------------------------------------------------------- */

const ALL_SCORE_LEVELS = Object.keys(SCORE_LEVEL_LABELS) as ScoreLevel[];

function ScoreTagsSection() {
  return (
    <PageSection
      title="Score tags"
      blurb="Every score in the UI carries the level it was created at — full pill in rows, compact dot in dense trees."
      aside={<InlineCode>{ALL_SCORE_LEVELS.length} levels</InlineCode>}
    >
      <SpecimenDuo>
        <Row>
          {ALL_SCORE_LEVELS.map((level) => (
            <ScoreTag key={level} level={level} />
          ))}
          {ALL_SCORE_LEVELS.map((level) => (
            <ScoreTag key={`${level}-compact`} level={level} compact />
          ))}
        </Row>
      </SpecimenDuo>
      <Rides>
        the global score-level hue pairs — observation on{" "}
        <InlineCode>info-tint + info</InlineCode> (blue), trace on{" "}
        <InlineCode>score-trace(-tint)</InlineCode> (violet), session on{" "}
        <InlineCode>score-session(-tint)</InlineCode> (teal), experiment on{" "}
        <InlineCode>warning-tint + warning</InlineCode> (yellow). Coding &amp;
        usage rules: the ScoreTag story (Playground → ScoreTag → Guidance).
      </Rides>
    </PageSection>
  );
}

/* ------------------------------------------------------------------------- *
 * EnvLabelBadge: the cloud-region chip in the header.
 * ------------------------------------------------------------------------- */

function EnvironmentLabelsSection() {
  const noop = () => undefined;
  return (
    <PageSection
      title="Environment labels"
      blurb="The header's cloud-region indicator: DEV / STAGING / PROD-{region}."
      aside={<InlineCode>3 variants</InlineCode>}
    >
      <SpecimenDuo>
        <Row>
          <EnvLabelBadge region="DEV" onClick={noop} />
          <EnvLabelBadge region="STAGING" onClick={noop} />
          <EnvLabelBadge region="EU" onClick={noop} />
        </Row>
      </SpecimenDuo>
      <Rides>
        <InlineCode>success-tint + success</InlineCode> (dev),{" "}
        <InlineCode>info-tint + info</InlineCode> (staging),{" "}
        <InlineCode>danger-tint + danger</InlineCode> (prod — deliberately
        loud). A trace&apos;s own environment renders as Badge{" "}
        <InlineCode>tertiary</InlineCode> (
        <InlineCode>EnvironmentBadge</InlineCode> in TraceMetadataBadges), not
        this.
      </Rides>
    </PageSection>
  );
}

/* ------------------------------------------------------------------------- *
 * Observation-level chips: composed from getLevelColors at every call site.
 * ------------------------------------------------------------------------- */

const ALL_LEVELS = Object.keys(LevelColors) as Array<keyof typeof LevelColors>;

function LevelsSection() {
  return (
    <PageSection
      title="Levels"
      blurb="The observation-level chip in tables and the trace tree — status colors keyed by level."
      aside={<InlineCode>{ALL_LEVELS.length} levels</InlineCode>}
    >
      <SpecimenDuo>
        <Row>
          {ALL_LEVELS.map((level) => (
            <span
              key={level}
              className={cn(
                "rounded-sm p-0.5 text-xs",
                getLevelColors(level).bg,
                getLevelColors(level).text,
              )}
            >
              {level}
            </span>
          ))}
        </Row>
      </SpecimenDuo>
      <Rides>
        <InlineCode>danger-tint + danger</InlineCode> (ERROR),{" "}
        <InlineCode>warning-tint + warning</InlineCode> (WARNING),{" "}
        <InlineCode>muted-gray</InlineCode> (DEBUG); DEFAULT is deliberately
        unstyled. No shared chip component yet — call sites compose{" "}
        <InlineCode>getLevelColors</InlineCode> (level-colors.tsx), which is
        total over unknown OTel levels.
      </Rides>
    </PageSection>
  );
}

/* ------------------------------------------------------------------------- *
 * TagButton: user-defined trace / prompt tags.
 * ------------------------------------------------------------------------- */

function TagsSection() {
  return (
    <PageSection
      title="Tags"
      blurb="User-defined trace and prompt tags — a tag icon plus the free-form name; identity by shape, never by color."
    >
      <SpecimenDuo>
        <Row>
          <TagButton tag="production" loading={false} />
          <TagButton tag="experiment-7" loading={false} />
          <TagButton
            tag="a-very-long-tag-name-that-truncates"
            loading={false}
          />
          <TagButton tag="view-only" loading={false} viewOnly />
        </Row>
      </SpecimenDuo>
      <Rides>
        Button <InlineCode>tertiary</InlineCode> (
        <InlineCode>muted-gray</InlineCode> fill + primary text); the editable
        variant is a real button that opens the tag popover.
      </Rides>
    </PageSection>
  );
}

/* ------------------------------------------------------------------------- *
 * The decision list.
 * ------------------------------------------------------------------------- */

const DECISIONS: Array<{ need: string; use: ReactNode }> = [
  {
    need: "Neutral or emphasis label",
    use: (
      <>
        <InlineCode>Badge</InlineCode> secondary / tertiary / outline-solid
      </>
    ),
  },
  {
    need: "Status word",
    use: (
      <>
        <InlineCode>Badge</InlineCode> success / error / warning; with a live
        dot → <InlineCode>StatusBadge</InlineCode>
      </>
    ),
  },
  {
    need: "Entity or observation type",
    use: <InlineCode>ItemBadge</InlineCode>,
  },
  {
    need: "Score context (mandatory next to every score)",
    use: <InlineCode>ScoreTag</InlineCode>,
  },
  {
    need: "Observation level",
    use: (
      <>
        <InlineCode>getLevelColors</InlineCode> chip
      </>
    ),
  },
  {
    need: "User tags / cloud region / trace env",
    use: (
      <>
        <InlineCode>TagButton</InlineCode> /{" "}
        <InlineCode>EnvLabelBadge</InlineCode> /{" "}
        <InlineCode>Badge tertiary</InlineCode>
      </>
    ),
  },
];

function DecisionSection() {
  return (
    <PageSection title="Which one do I use?">
      <ul className="flex max-w-2xl flex-col gap-1.5">
        {DECISIONS.map(({ need, use }) => (
          <li key={need} className="flex items-baseline gap-2 text-sm">
            <span className="text-tertiary min-w-0 flex-1">{need}</span>
            <span className="text-foreground">{use}</span>
          </li>
        ))}
      </ul>
      <p className="text-tertiary text-sm">
        Composed on these primitives elsewhere: grouped score chips, token-usage
        badge, trace metadata badges (Env / Release / Version), monitor severity
        (pending its move onto Badge status variants).
      </p>
    </PageSection>
  );
}

export function BadgesAndTags() {
  return (
    <div className="p-6 md:p-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-10">
        <PageHeader
          eyebrow="Design reference"
          title="Badges & tags"
          lede="Small labels for status, categorization, and metadata. Every specimen is the real component, imported live and rendered in both themes — the left pane follows the toolbar theme, the right pane is pinned dark."
          meta={
            <>
              {BADGE_VARIANT_NAMES.length} Badge variants ·{" "}
              {Object.keys(iconMap).length} item types ·{" "}
              {ALL_SCORE_LEVELS.length} score levels · {ALL_LEVELS.length}{" "}
              observation levels
            </>
          }
        />
        <BadgeSection />
        <StatusesSection />
        <ObservationTypesSection />
        <ScoreTagsSection />
        <EnvironmentLabelsSection />
        <LevelsSection />
        <TagsSection />
        <DecisionSection />
      </div>
    </div>
  );
}
