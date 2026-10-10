import Head from "next/head";
import Link from "next/link";

const valueCards = [
  {
    title: "Identify turns with unhappy thumbs-down",
    description:
      "Thumbs-down, retries and rage-repeats surface as scores on the exact turn they happened. Open the trace and read the full context.",
    cta: "Session tracing",
  },
  {
    title: "Get full cost transparency",
    description:
      "Break out token and tool costs by turn, session and user. Set model-level rate cards and watch spend evolve in real time.",
    cta: "Cost tracking",
  },
  {
    title: "Ensure quality for chat interactions",
    description:
      "Run LLM-as-a-judge checks in live turns for frustration, tone and instruction-following. Promote only when scores stay healthy.",
    cta: "Evaluations",
  },
];

const testimonials = [
  {
    quote:
      "We stopped guessing why sessions failed and could finally see the exact turn, retried context and true cost in one view.",
    role: "Engineering Lead, AI Platform",
  },
  {
    quote:
      "Self-hosted, OpenTelemetry-native and auditable. We cleared review and still fixed our same-day debugging workflow.",
    role: "Lead ML Engineer",
  },
  {
    quote:
      "Evals on live traffic now catch prompt drift before release, so we ship chat changes weekly without fear.",
    role: "Staff Engineer, AI Products",
  },
];

const integrations = [
  "OpenAI",
  "Anthropic",
  "LangChain",
  "LangGraph",
  "LlamaIndex",
  "Vercel AI SDK",
  "OpenAI Agents",
  "Pydantic AI",
  "CrewAI",
  "Python",
  "TypeScript",
  "OpenTelemetry",
];

const heroStats = [
  { label: "chat sessions traced", value: "1.4B+" },
  { label: "turns scored / month", value: "38M" },
  { label: "companies in production", value: "2,300+" },
  { label: "agent framework integrations", value: "80+" },
];

export default function ChatAgentsPage() {
  return (
    <>
      <Head>
        <title>Langfuse for chat agents</title>
      </Head>

      <main className="bg-muted text-foreground">
        <div className="mx-auto max-w-[1150px] px-6 pt-8 pb-16">
          <p className="text-muted-foreground text-[10px] tracking-[0.16em] uppercase">
            Turn 1 · Langfuse for chat agents
          </p>

          <div className="border-border bg-background mt-3 rounded-md border shadow-sm">
            <header className="border-border flex items-center justify-between border-b px-6 py-4">
              <div className="flex items-center gap-8">
                <span className="text-sm font-bold">langfuse</span>
                <nav className="text-muted-foreground hidden gap-5 text-sm md:flex">
                  <Link href="#" aria-label="Platform">
                    Platform
                  </Link>
                  <Link href="#" aria-label="Use cases">
                    Use cases
                  </Link>
                  <Link href="#" aria-label="Docs">
                    Docs
                  </Link>
                  <Link href="#" aria-label="Pricing">
                    Pricing
                  </Link>
                  <Link href="#" aria-label="Customers">
                    Customers
                  </Link>
                </nav>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <button className="border-border bg-background rounded-sm border px-2 py-1">
                  Sign in
                </button>
                <button className="bg-primary text-primary-foreground rounded-sm px-2.5 py-1">
                  Start free
                </button>
              </div>
            </header>

            <section className="border-border grid gap-10 border-b px-8 py-10 lg:grid-cols-2">
              <div>
                <p className="text-muted-foreground mb-5 text-[10px] tracking-[0.14em] uppercase">
                  Use case / Chat agents
                </p>
                <h1 className="max-w-[420px] text-5xl leading-[1.02] font-bold tracking-[-0.02em]">
                  Ship chat agents your users{" "}
                  <span className="bg-light-yellow px-1">keep talking to</span>
                </h1>
                <p className="text-muted-foreground mt-6 max-w-[460px] text-[15px] leading-7">
                  While multi-turn chat is hard to debug, Langfuse traces every
                  turn end to end. See where a conversation went sideways, what
                  each turn cost and whether users stay satisfied.
                </p>
                <div className="mt-8 flex gap-3">
                  <button className="bg-primary text-primary-foreground rounded-sm px-4 py-2 text-sm">
                    Start free
                  </button>
                  <button className="border-border bg-background rounded-sm border px-4 py-2 text-sm">
                    Talk to sales
                  </button>
                </div>
              </div>

              <div className="border-border bg-background rounded-md border p-4 text-sm shadow-sm">
                <div className="text-muted-foreground mb-3 flex justify-between text-[10px] uppercase">
                  <span>Session · cs-agent-prod · #2104</span>
                  <span>7 turns · $0.26</span>
                </div>

                <div className="space-y-3 text-[13px] leading-5">
                  <div className="border-border bg-muted ml-8 rounded-md border px-3 py-2">
                    Where is my payout for last week?
                  </div>
                  <div className="border-border bg-background rounded-md border px-3 py-2">
                    I can help with that. Your last payout was on 12 May for
                    €248.10.
                  </div>
                  <div className="border-border bg-muted ml-14 rounded-md border px-3 py-2">
                    That&apos;s not what I asked. Last week.
                  </div>
                  <div className="border-dark-yellow/35 bg-light-yellow text-dark-yellow rounded-md border px-3 py-2">
                    Sorry — checking 20-26 May now. Payout of €412.60 settles
                    tomorrow.
                  </div>
                </div>

                <div className="border-border mt-4 grid grid-cols-4 gap-2 border-t pt-3 text-[11px]">
                  <div>
                    <p className="text-muted-foreground uppercase">
                      frustrated turn
                    </p>
                    <p className="text-base font-bold">3 of 7</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground uppercase">
                      cost / turn
                    </p>
                    <p className="text-base font-bold">$0.026</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground uppercase">
                      eval score
                    </p>
                    <p className="text-base font-bold">0.84</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground uppercase">resolved</p>
                    <p className="text-base font-bold">yes</p>
                  </div>
                </div>
              </div>
            </section>

            <section className="divide-border grid divide-y md:grid-cols-4 md:divide-x md:divide-y-0">
              {heroStats.map((stat) => (
                <div key={stat.label} className="px-6 py-4">
                  <p className="text-2xl font-bold">{stat.value}</p>
                  <p className="text-muted-foreground mt-1 text-[10px] tracking-[0.12em] uppercase">
                    {stat.label}
                  </p>
                </div>
              ))}
            </section>
          </div>

          <section className="border-border bg-background mt-12 rounded-md border px-8 py-12">
            <h2 className="text-center text-4xl font-bold tracking-[-0.02em]">
              Trace the full session, not one call
            </h2>
            <p className="text-muted-foreground mx-auto mt-4 max-w-[700px] text-center text-[15px] leading-7">
              One session is dozens of model calls, tool actions and retries.
              Group each turn by user and session, then inspect the full
              conversation the way your users experienced it.
            </p>

            <div className="mt-10 grid gap-5 lg:grid-cols-3">
              {valueCards.map((card) => (
                <article
                  key={card.title}
                  className="border-border bg-background rounded-md border px-6 py-6"
                >
                  <p className="text-muted-foreground text-[10px] tracking-[0.12em] uppercase">
                    Sessions
                  </p>
                  <h3 className="mt-3 text-xl font-bold tracking-[-0.01em]">
                    {card.title}
                  </h3>
                  <p className="text-muted-foreground mt-4 text-[14px] leading-6">
                    {card.description}
                  </p>
                  <p className="mt-6 text-sm">{card.cta} →</p>
                </article>
              ))}
            </div>
          </section>

          <section className="border-border bg-background mt-12 rounded-md border px-8 py-12">
            <p className="text-muted-foreground text-center text-[10px] tracking-[0.14em] uppercase">
              Customers
            </p>
            <h2 className="mt-3 text-center text-4xl font-bold tracking-[-0.02em]">
              Teams running chat in production
            </h2>

            <div className="mt-8 grid gap-5 lg:grid-cols-3">
              {testimonials.map((item) => (
                <article
                  key={item.quote}
                  className="border-border bg-background rounded-md border px-5 py-5"
                >
                  <p className="text-[15px] leading-7">“{item.quote}”</p>
                  <div className="text-muted-foreground mt-6 text-xs">
                    <p className="text-foreground-tertiary text-[11px]">logo</p>
                    <p>{item.role}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="border-border bg-background mt-12 rounded-md border px-8 py-12">
            <p className="text-muted-foreground text-center text-[10px] tracking-[0.14em] uppercase">
              Integrations
            </p>
            <h2 className="mt-3 text-center text-4xl font-bold tracking-[-0.02em]">
              Any model, any framework
            </h2>
            <p className="text-muted-foreground mt-3 text-center text-[15px]">
              Built on OpenTelemetry. Plug in your SDK and keep your stack.
            </p>

            <div className="border-border mt-8 grid grid-cols-2 overflow-hidden rounded-md border sm:grid-cols-3 lg:grid-cols-6">
              {integrations.map((integration) => (
                <div
                  key={integration}
                  className="border-border bg-background border-r border-b px-3 py-4 text-center text-sm last:border-r-0 lg:[&:nth-child(6n)]:border-r-0 [&:nth-last-child(-n+6)]:border-b-0"
                >
                  {integration}
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>
    </>
  );
}

ChatAgentsPage.skipAppLayout = true;
