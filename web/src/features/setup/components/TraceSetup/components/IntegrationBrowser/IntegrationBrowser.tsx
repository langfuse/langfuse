"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight } from "@langfuse/icons";
import { Button } from "@/src/components/design-system/Button/Button";
import { EmptyState } from "@/src/components/design-system/EmptyState/EmptyState";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { IntegrationLogo } from "@/src/components/design-system/IntegrationLogo/IntegrationLogo";
import { SearchInput } from "@/src/components/design-system/SearchInput/SearchInput";
import { Toggle } from "@/src/components/design-system/Toggle/Toggle";
import {
  CATEGORY_COUNTS,
  CATEGORY_TITLES,
  integrationOf,
} from "../../../../integrations/catalog";
import {
  INTEGRATION_CATEGORIES,
  INTEGRATIONS,
} from "../../../../integrations/generated";
import { logoOf } from "../../../../integrations/logos";
import {
  nearMisses,
  POPULAR_SLUGS,
  searchIndexOf,
  searchIntegrations,
} from "../../../../integrations/search";
import type { Integration } from "../../../../integrations/types";

const SEARCH_INDEX = searchIndexOf(INTEGRATIONS, CATEGORY_TITLES);

const POPULAR = POPULAR_SLUGS.flatMap((slug) => integrationOf(slug) ?? []);

/** How many integrations a category shows in the All view before "Show all". */
const CATEGORY_PREVIEW = 6;

/** A category's popular integrations first, then the rest in catalog order. */
function previewOf(integrations: Integration[]) {
  const rank = (integration: Integration) => {
    const index = POPULAR_SLUGS.indexOf(integration.slug);
    return index === -1 ? POPULAR_SLUGS.length : index;
  };
  return integrations
    .toSorted((a, b) => rank(a) - rank(b))
    .slice(0, CATEGORY_PREVIEW);
}

const CATEGORY_CHIPS = [
  { id: null, title: "All", count: INTEGRATIONS.length },
  ...INTEGRATION_CATEGORIES.map(({ id, title }) => ({
    id,
    title,
    count: CATEGORY_COUNTS[id] ?? 0,
  })),
];

type IntegrationBrowserProps = {
  /** Where a setup opened from here sends its traces; a new project says so beside the title. */
  project: "this" | "new";
  /** The category chip that's on; `null` is All. */
  category: string | null;
  onCategoryChange: (category: string | null) => void;
  onOpenSetup: (slug: string) => void;
  /** Closes the panel, back to the page. */
  onClose: () => void;
};

/** The categories on one row that scrolls sideways, fading at its end, so the list keeps the panel's height. */
function CategoryChips({
  category,
  onChange,
}: {
  category: string | null;
  onChange: (category: string | null) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Categories"
      className="-mx-0.5 flex gap-1.5 overflow-x-auto [mask-image:linear-gradient(to_right,black_calc(100%-2rem),transparent)] px-0.5 py-0.5 pr-8 [scrollbar-width:none]"
    >
      {CATEGORY_CHIPS.map((chip) => (
        <Toggle
          key={chip.title}
          variant="chip"
          count={chip.count}
          pressed={category === chip.id}
          onClick={() => onChange(chip.id)}
        >
          {chip.title}
        </Toggle>
      ))}
    </div>
  );
}

/** Integrations as cards: the logo and the name, with its category where the list mixes them; what it does is the card's description and tooltip. */
function IntegrationList({
  integrations,
  showsCategory,
  onOpenSetup,
}: {
  integrations: Integration[];
  showsCategory: boolean;
  onOpenSetup: (slug: string) => void;
}) {
  return (
    <ul className="grid grid-cols-1 gap-1.5 @md:grid-cols-2">
      {integrations.map((integration) => (
        <li key={integration.slug} className="flex">
          <button
            type="button"
            onClick={() => onOpenSetup(integration.slug)}
            aria-label={integration.name}
            aria-describedby={`integration-${integration.slug}-description`}
            title={integration.description}
            className="group/card bg-background hover:border-border focus-visible:ring-ring flex w-full min-w-0 rounded-xl border border-transparent p-2.5 text-left transition-colors duration-150 ease-out focus-visible:ring-2 focus-visible:outline-hidden motion-reduce:transition-none"
          >
            <span className="flex w-full min-w-0 items-center gap-2.5">
              <IntegrationLogo
                name={integration.name}
                {...logoOf(integration.slug)}
                size="md"
                shape="rounded"
                isDecorative
              />
              <span className="flex min-w-0 flex-1 flex-col">
                <span
                  className="truncate text-sm font-bold"
                  title={integration.name}
                >
                  {integration.name}
                </span>
                {showsCategory ? (
                  <span
                    className="text-muted-foreground truncate text-xs"
                    title={CATEGORY_TITLES[integration.category]}
                  >
                    {CATEGORY_TITLES[integration.category]}
                  </span>
                ) : null}
              </span>
              <span className="text-muted-foreground flex -translate-x-1 opacity-0 transition-[opacity,transform] duration-150 ease-out group-hover/card:translate-x-0 group-hover/card:opacity-100 group-focus-visible/card:translate-x-0 group-focus-visible/card:opacity-100 motion-reduce:transition-none">
                <ArrowRight size="sm" aria-hidden />
              </span>
            </span>
            <span
              id={`integration-${integration.slug}-description`}
              className="sr-only"
            >
              {integration.description}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function Results({
  matches,
  isNarrowed,
  showsCategory,
  onShowCategory,
  onOpenSetup,
}: {
  matches: Integration[];
  isNarrowed: boolean;
  showsCategory: boolean;
  onShowCategory: (category: string) => void;
  onOpenSetup: (slug: string) => void;
}) {
  if (isNarrowed)
    return (
      <IntegrationList
        integrations={matches}
        showsCategory={showsCategory}
        onOpenSetup={onOpenSetup}
      />
    );
  return (
    <div className="flex flex-col gap-5">
      {INTEGRATION_CATEGORIES.map(({ id, title }) => {
        const inCategory = matches.filter(
          (integration) => integration.category === id,
        );
        return (
          <section key={id} aria-label={title} className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between px-0.5">
              <h3 className="text-foreground-secondary text-xs font-bold tracking-wide uppercase">
                {title}
              </h3>
              {inCategory.length > CATEGORY_PREVIEW ? (
                <Button
                  text={`Show all ${inCategory.length}`}
                  variant="text"
                  size="sm"
                  onClick={() => onShowCategory(id)}
                />
              ) : null}
            </div>
            <IntegrationList
              integrations={previewOf(inCategory)}
              showsCategory={false}
              onOpenSetup={onOpenSetup}
            />
          </section>
        );
      })}
    </div>
  );
}

function noMatchesTitle(query: string, category: string | null) {
  const shown = query.trim();
  if (category === null) return `Nothing matches “${shown}”`;
  return `Nothing in ${CATEGORY_TITLES[category] ?? category} matches “${shown}”`;
}

function noMatchesCopy(
  query: string,
  category: string | null,
  elsewhereCount: number,
) {
  const title = noMatchesTitle(query, category);
  if (elsewhereCount === 1)
    return {
      title,
      text: "One integration in another category matches.",
      action: "Show it",
    };
  if (elsewhereCount > 1)
    return {
      title,
      text: `${elsewhereCount} integrations in other categories match.`,
      action: `Show all ${elsewhereCount}`,
    };
  return {
    title,
    text: "Check the spelling, or try your framework or model provider. Anything that sends OpenTelemetry works too.",
    action: "Set up OpenTelemetry",
  };
}

function wayBackFor(elsewhere: Integration[], near: Integration[]) {
  if (elsewhere.length > 0)
    return {
      heading: "In other categories",
      integrations: elsewhere.slice(0, 5),
    };
  if (near.length > 0) return { heading: "Did you mean", integrations: near };
  return { heading: "Popular", integrations: POPULAR };
}

/**
 * Nothing matches (the browser announces the title): where we looked, the one next step that fits (the other categories when they match, else
 * OpenTelemetry), and a way back to something real: those matches, near misses for a typo, or popular picks.
 */
function NoMatches({
  query,
  category,
  onShowAll,
  onClear,
  onOpenSetup,
}: {
  query: string;
  category: string | null;
  onShowAll: () => void;
  onClear: () => void;
  onOpenSetup: (slug: string) => void;
}) {
  const elsewhere =
    category === null ? [] : searchIntegrations(SEARCH_INDEX, query, null);
  const copy = noMatchesCopy(query, category, elsewhere.length);
  const wayBack = wayBackFor(elsewhere, nearMisses(SEARCH_INDEX, query));
  return (
    <div className="flex flex-col gap-4">
      <EmptyState size="sm">
        <EmptyState.Illustration
          drawing="noResults"
          motion="subtle"
          backdrop="none"
          accent="none"
        />
        <EmptyState.Title level="h3">{copy.title}</EmptyState.Title>
        <EmptyState.Description>{copy.text}</EmptyState.Description>
        <EmptyState.Actions>
          <Button
            text={copy.action}
            size="sm"
            onClick={
              elsewhere.length > 0
                ? onShowAll
                : () => onOpenSetup("opentelemetry")
            }
          />
          <Button
            text="Clear search"
            variant="ghost"
            size="sm"
            onClick={onClear}
          />
        </EmptyState.Actions>
      </EmptyState>
      <section
        aria-label={wayBack.heading}
        className="flex flex-col gap-2 border-t pt-3"
      >
        <h3 className="text-foreground-secondary px-0.5 text-xs font-bold tracking-wide uppercase">
          {wayBack.heading}
        </h3>
        <IntegrationList
          integrations={wayBack.integrations}
          showsCategory
          onOpenSetup={onOpenSetup}
        />
      </section>
    </div>
  );
}

/**
 * Every integration, grouped by category; a category chip or a search narrows it to one list. The list scrolls in
 * its own box, so the panel keeps its place on the page.
 */
export function IntegrationBrowser({
  project,
  category,
  onCategoryChange,
  onOpenSetup,
  onClose,
}: IntegrationBrowserProps) {
  const [query, setQuery] = useState("");
  const matches = searchIntegrations(SEARCH_INDEX, query, category);
  const isNarrowed = category !== null || query.trim() !== "";

  return (
    <>
      <header className="flex items-center gap-2.5">
        <IconButton
          icon={ArrowLeft}
          label="Back"
          size="sm"
          variant="ghost"
          onClick={onClose}
        />
        <h2 className="text-sm font-bold">Integrations</h2>
        {project === "new" ? (
          <span className="text-muted-foreground text-xs">
            for a new project of their own
          </span>
        ) : null}
      </header>
      <div className="flex flex-col gap-2.5 border-b py-3">
        <SearchInput
          value={query}
          onChange={setQuery}
          onSubmit={setQuery}
          placeholder={`Search ${INTEGRATIONS.length} integrations…`}
          autoFocus
        />
        <CategoryChips category={category} onChange={onCategoryChange} />
      </div>
      <div className="@container -mx-1 max-h-[min(30rem,60vh)] overflow-y-auto px-1 pt-3 pb-1">
        {matches.length === 0 ? (
          <NoMatches
            query={query}
            category={category}
            onShowAll={() => onCategoryChange(null)}
            onClear={() => setQuery("")}
            onOpenSetup={onOpenSetup}
          />
        ) : (
          <Results
            matches={matches}
            isNarrowed={isNarrowed}
            showsCategory={category === null}
            onShowCategory={onCategoryChange}
            onOpenSetup={onOpenSetup}
          />
        )}
        {matches.length > 0 ? (
          <p className="text-muted-foreground mt-5 text-xs">
            Not listed? Anything that sends OpenTelemetry works:{" "}
            <Button
              text="set up OpenTelemetry"
              variant="text"
              size="sm"
              onClick={() => onOpenSetup("opentelemetry")}
            />{" "}
            ·{" "}
            <Button
              text="the full catalogue"
              variant="text"
              size="sm"
              href="https://langfuse.com/integrations"
            />
          </p>
        ) : null}
      </div>
      <p role="status" className="sr-only">
        {matches.length === 0 ? noMatchesTitle(query, category) : ""}
      </p>
    </>
  );
}
