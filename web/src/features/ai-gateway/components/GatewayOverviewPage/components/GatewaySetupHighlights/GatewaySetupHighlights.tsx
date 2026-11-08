import { Check } from "@langfuse/icons";
import { SiClaude, SiGithubcopilot, SiOpenai } from "@langfuse/icons/si";

import { Button } from "@/src/components/design-system/Button/Button";
import { GATEWAY_SETUP } from "@/src/features/ai-gateway/components/GatewaySetupPage/constants/gatewaySetup";

const BENEFITS = [
  "Use one key for Anthropic and OpenAI",
  "Track spend by person, team, and key",
  "Approve and remove models for entire company",
  "Record full traces, not just token counts",
];

const AGENTS = [
  { name: "Claude Code", logo: <SiClaude size="lg" aria-hidden /> },
  { name: "Codex", logo: <SiOpenai size="lg" aria-hidden /> },
  { name: "GitHub Copilot", logo: <SiGithubcopilot size="lg" aria-hidden /> },
  { name: "OpenCode", logo: <OpenCodeMark /> },
  { name: "Pi", logo: <PiMark /> },
];

/** Side column of the setup Overview: what the gateway adds and which agents use it. */
export function GatewaySetupHighlights() {
  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-bold">What you get</h3>
        <ul className="flex flex-col gap-2.5 text-sm">
          {BENEFITS.map((benefit) => (
            <li key={benefit} className="flex items-start gap-2">
              <Check
                size="base"
                aria-hidden
                __rawClassName="text-dark-green mt-0.5"
              />
              {benefit}
            </li>
          ))}
        </ul>
      </section>
      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-bold">Works with</h3>
        <ul className="text-foreground flex flex-wrap items-center gap-5">
          {AGENTS.map(({ name, logo }) => (
            <li key={name} title={name} className="flex items-center">
              {logo}
              <span className="sr-only">{name}</span>
            </li>
          ))}
        </ul>
      </section>
      <div>
        <Button
          variant="text"
          text="How to set up the gateway"
          href={GATEWAY_SETUP.docsUrl}
        />
      </div>
    </div>
  );
}

/** Marks from opencode.ai and pi.dev, drawn in the current text color. */
function OpenCodeMark() {
  return (
    <svg viewBox="128 96 256 320" width={16} height={20} aria-hidden="true">
      <path d="M320 224V352H192V224H320Z" fill="currentColor" opacity={0.4} />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M384 416H128V96H384V416ZM320 160H192V352H320V160Z"
        fill="currentColor"
      />
    </svg>
  );
}

function PiMark() {
  return (
    <svg viewBox="0 0 560 560" width={20} height={20} aria-hidden="true">
      <path d="M420 280H280V140H0V0H420V280Z" fill="currentColor" />
      <path d="M560 560H420V280H560V560Z" fill="currentColor" />
      <path d="M140 560H0V140H140V280H280V420H140V560Z" fill="currentColor" />
    </svg>
  );
}
