import {
  Activity,
  Archive,
  CalendarClock,
  FileCheck,
  Headset,
  type IconComponent,
  KeyRound,
  Layers,
  LifeBuoy,
  Lock,
  Network,
  ScrollText,
  Shield,
  Tag,
  UserCog,
  Users,
} from "@langfuse/icons";

import { Accordion } from "@/src/components/design-system/Accordion/Accordion";
import {
  type PlanLine,
  type PlanLineKind,
} from "@/src/ee/features/billing/constants/pricingPlans";
import { type OverLimitMarkers } from "@/src/ee/features/billing/fns/overLimitMarkers";
import { type PlanLimitChange } from "@/src/ee/features/billing/fns/planLimitChanges";
import { type PlanLineChanges } from "@/src/ee/features/billing/fns/planLineChanges";

const kindIcon: Record<PlanLineKind, IconComponent> = {
  platform: Layers,
  support: Headset,
  "data-retention": Archive,
  compliance: FileCheck,
  hipaa: Shield,
  sso: KeyRound,
  "sso-enforcement": Lock,
  rbac: Users,
  "protected-labels": Tag,
  "blob-export": CalendarClock,
  "audit-logs": ScrollText,
  scim: UserCog,
  "uptime-sla": Activity,
  "support-sla": LifeBuoy,
  "private-link": Network,
};

const planNames = new Intl.ListFormat("en", {
  style: "long",
  type: "conjunction",
});

function LineGrid({ lines }: { lines: ReadonlyArray<PlanLine> }) {
  return (
    <ul className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
      {lines.map((entry) => {
        const Icon = kindIcon[entry.kind];
        return (
          <li key={entry.text} className="flex items-start gap-2">
            <Icon size="sm" __rawClassName="mt-0.5 shrink-0" aria-hidden />
            {entry.text}
          </li>
        );
      })}
    </ul>
  );
}

/** What a plan change gives up, in the pricing page's words, and the limits that drop on the new plan. */
export function PlanLossSummary({
  lost,
  limits,
  markers,
  targetLabel,
}: {
  lost: PlanLineChanges;
  limits: ReadonlyArray<PlanLimitChange>;
  /** A few words beside a limit the organization is over today. */
  markers: OverLimitMarkers;
  /** The plan the organization moves to. */
  targetLabel: string;
}) {
  const lower = limits.filter((limit) => limit.direction === "down");

  return (
    <>
      {lost.own.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h3 className="font-medium">You lose</h3>
          <LineGrid lines={lost.own} />
          {lost.inherited.length > 0 ? (
            <Accordion type="single" collapsible>
              <Accordion.Item value="inherited">
                <Accordion.Trigger size="sm">
                  Also from {planNames.format(lost.inheritedFrom)}
                </Accordion.Trigger>
                <Accordion.Content>
                  <div className="pt-1 pb-3">
                    <LineGrid lines={lost.inherited} />
                  </div>
                </Accordion.Content>
              </Accordion.Item>
            </Accordion>
          ) : null}
        </section>
      ) : null}

      {lower.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h3 className="font-medium">On {targetLabel}</h3>
          {/* The tiles can carry the organization's member and usage counts, kept out of session replay. */}
          <ul className="ph-no-capture grid grid-cols-3 gap-2">
            {lower.map((limit) => (
              <li
                key={limit.kind}
                className="flex flex-col gap-0.5 rounded-md border p-3"
              >
                <span className="text-lg leading-tight font-medium">
                  {limit.now}
                </span>
                <span className="text-muted-foreground text-xs">
                  {limit.label}
                </span>
                {markers[limit.kind] ? (
                  <span className="text-xs font-medium">
                    {markers[limit.kind]}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
