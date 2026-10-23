"use client";

import { useState } from "react";
import { ArrowLeft } from "@langfuse/icons";
import { Button } from "@/src/components/design-system/Button/Button";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { IntegrationLogo } from "@/src/components/design-system/IntegrationLogo/IntegrationLogo";
import { CATEGORY_TITLES } from "../../../../integrations/catalog";
import { logoOf } from "../../../../integrations/logos";
import type { Integration } from "../../../../integrations/types";
import type { CopyChecks, ProjectKeys, SetupTarget } from "../../types";
import { IntegrationSteps } from "../IntegrationSteps/IntegrationSteps";

type IntegrationSetupProps = {
  integration: Integration;
  target: SetupTarget;
  /** Goes to every integration. */
  onBack: () => void;
  keys: ProjectKeys;
  baseUrl: string;
  manageKeysPath: string;
  onCreateKeys: () => void;
  onCopy: (part: keyof CopyChecks) => void;
};

/** Takes focus when the setup opens, since what was focused is gone; focusing scrolls it into view. */
const focusOnOpen = (heading: HTMLHeadingElement | null) => heading?.focus();

/** One integration's setup in the panel, for the other way in: its name, then the new project, its keys and the setup. */
export function IntegrationSetup({
  integration,
  onBack,
  onCopy,
  ...steps
}: IntegrationSetupProps) {
  const categoryTitle = CATEGORY_TITLES[integration.category];
  const [copied, setCopied] = useState({ env: false, setup: false });
  return (
    <>
      <header className="flex items-center gap-2.5 border-b pb-3">
        <IconButton
          icon={ArrowLeft}
          label="All integrations"
          size="sm"
          variant="ghost"
          onClick={onBack}
        />
        <IntegrationLogo
          name={integration.name}
          {...logoOf(integration.slug)}
          size="md"
          shape="rounded"
          isDecorative
        />
        <h2
          ref={focusOnOpen}
          tabIndex={-1}
          className="truncate text-sm font-bold outline-hidden"
          title={integration.name}
        >
          {integration.name}
        </h2>
        <span
          className="text-muted-foreground truncate text-xs"
          title={categoryTitle}
        >
          {categoryTitle}
        </span>
      </header>
      <div className="flex flex-col gap-4 pt-4">
        <IntegrationSteps
          integration={integration}
          {...steps}
          copied={copied}
          onCopy={(part) => {
            setCopied((current) => ({ ...current, [part]: true }));
            onCopy(part);
          }}
          shouldAnimate
        />
        <p className="text-muted-foreground text-xs">
          Not your stack?{" "}
          <Button
            text="See all integrations"
            variant="text"
            size="sm"
            onClick={onBack}
          />
        </p>
      </div>
    </>
  );
}
