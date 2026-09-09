import { prisma } from "../../../src/db";
import {
  createTrace,
  createObservation,
  createTraceScore,
  createTracesCh,
  createObservationsCh,
  createScoresCh,
  createEventsCh,
  ObservationRecordInsertType,
  ScoreRecordInsertType,
  TraceRecordInsertType,
} from "../../../src/server";
import { ObservationType } from "../../../src/domain";
import { observationToEvent, traceToEvent } from "./event-mirror";
import { jitter, Rng } from "./rng";
import {
  chunk,
  ScenarioContext,
  ScenarioDefinition,
  SeedError,
  SeedSummary,
} from "./types";
import { countRows, traceLink, tracesListLink } from "./verify";

/**
 * Production-shaped traces from a design tool's in-product help assistant, for
 * judging the trace-detail view against what a real customer's trace looks
 * like rather than against synthetic stress shapes.
 *
 * One trace = one user question. The root SPAN "Help Assistant" carries the
 * question as input and the markdown answer as output, wraps a short "Gather
 * context" span and a long "Responding to request" span, and the latter runs a
 * sequential pipeline of classifier / generator steps each present with its
 * own probability (escalation check, utterance analysis, incident check, quick
 * actions, the answer generation, source articles, guided tour, bug/wish).
 * Only the answer generation carries scores (EVAL source, three names). Costs
 * are aggregated up onto "Responding to request" and the root, as the
 * customer's instrumentation does, so the trace-level cost in the list is the
 * sum of those roll-ups (3x the generation spend).
 *
 * Traces spread uniformly over the last three hours, a few per minute at most,
 * grouped into sessions of 1-5 per user. Environment is "prod" unless
 * --environment is set. Deterministic: one rng stream per trace, jitter-derived
 * timings, ids from --id-prefix; re-runs within the same UTC hour overwrite in
 * place.
 */

const WINDOW_MS = 3 * 60 * 60 * 1000;

const DEFAULT_ENVIRONMENT = "prod";

const MODEL_OUTPUT_PRICE: Record<string, number> = {
  "gpt-4.1": 8e-6,
  "gpt-4.1-mini": 1.6e-6,
};

type Locale = "en" | "pt-BR" | "es" | "de";

const LOCALES: readonly Locale[] = [
  "en",
  "en",
  "en",
  "en",
  "en",
  "en",
  "pt-BR",
  "pt-BR",
  "es",
  "de",
];

const COUNTRIES: Record<Locale, readonly string[]> = {
  en: ["US", "US", "US", "GB"],
  "pt-BR": ["BR"],
  es: ["ES"],
  de: ["DE"],
};

const LANGUAGE_TAG: Record<Locale, string> = {
  en: "Language: English",
  "pt-BR": "Language: Portuguese",
  es: "Language: English",
  de: "Language: English",
};

const ROLE_SETS: readonly (readonly string[])[] = [
  ["USER", "BRAND_OWNER", "BRAND_ADMIN", "BRAND_DESIGNER"],
  ["USER", "BRAND_OWNER", "BRAND_ADMIN", "BRAND_DESIGNER"],
  ["USER", "BRAND_OWNER", "BRAND_ADMIN", "BRAND_DESIGNER"],
  ["USER", "PERSONAL_BRAND"],
  ["USER", "PERSONAL_BRAND"],
  ["USER", "BRAND_DESIGNER"],
  ["USER", "PERSONAL_BRAND", "EXPIRING_USER"],
  ["USER", "BRAND_OWNER", "BRAND_ADMIN", "BRAND_DESIGNER", "EXPIRING_USER"],
];

const SUBSCRIPTIONS = ["FREE", "FREE", "FREE", "PRO", "PRO", "TEAMS"] as const;

const RELEASES = [
  "2026.09.10-3",
  "2026.09.10-3",
  "2026.09.10-3",
  "2026.09.10-3",
  "2026.09.10-3",
  "2026.09.10-2",
] as const;

type Question = {
  locale: Locale;
  question: string;
  answer: string;
  /** slug used in ids and in the quick-action classifier output */
  intent: string;
};

const QUESTIONS: Question[] = [
  {
    locale: "en",
    intent: "print-design",
    question: "How do I print my design?",
    answer:
      "You can print straight from the editor or order prints from us.\n\n1. Open your design and select **Share** in the top-right corner.\n2. Choose **Download**, pick **PDF Print** as the file type, and tick **Crop marks and bleed** if your printer asked for them.\n3. Open the PDF and print it from your device, or go back to **Share** and choose **Print your design** to order professional prints delivered to you.\n\nFor the sharpest result keep images at 300 DPI and use the CMYK colour profile option in the download settings. If the printed colours look different from your screen, that is usually the RGB to CMYK conversion, so preview the CMYK version before you print a large batch.",
  },
  {
    locale: "en",
    intent: "cancel-plan",
    question: "How do I cancel my Pro subscription?",
    answer:
      "You can cancel any time and keep Pro until the end of the current billing period.\n\n1. Click the **gear icon** in the top-right corner to open your settings.\n2. Select **Billing & plans** in the left sidebar.\n3. Next to your Pro plan, choose **Cancel subscription** and confirm.\n\nYour designs, folders and uploads stay in your account. Pro-only assets such as premium elements are no longer editable once the plan ends, and Brand Kit shrinks to the free limit. If you were charged after cancelling, reply here with the invoice date and we will look into it.",
  },
  {
    locale: "en",
    intent: "desktop-app",
    question:
      "How can I tell if I'm using the desktop app or the browser version?",
    answer:
      "There are a couple of quick ways to check.\n\n1. Look at the **window frame**. The desktop app has no address bar or browser tabs, while the browser version shows the URL at the top.\n2. On Mac, check the menu bar: the app name appears next to the Apple logo. On Windows, right-click the taskbar icon and look for **Pin to taskbar**, which only appears for installed apps.\n3. In the app, open **Settings** and scroll to the bottom. The desktop app shows an **App version** number there.\n\nBoth versions share the same account and designs, so switching between them does not move or duplicate anything.",
  },
  {
    locale: "en",
    intent: "resize",
    question: "How do I resize a design for Instagram?",
    answer:
      "Use **Resize** to make a copy in the new dimensions without touching the original.\n\n1. Open the design and click **Resize** in the top toolbar.\n2. Search for **Instagram Post** (1080 x 1080 px) or **Instagram Story** (1080 x 1920 px), or type custom dimensions.\n3. Choose **Copy & resize** to keep the original, or **Resize this design** to change it in place.\n\nElements move to roughly the right spot, but check text boxes and photos as cropping can shift. Resize is a Pro feature; on the free plan you can create a new Instagram design and copy your elements across with Ctrl/Cmd + C and V.",
  },
  {
    locale: "en",
    intent: "export-pdf",
    question: "How do I export my design as a PDF for print?",
    answer:
      "For anything you plan to print, use the **PDF Print** option rather than PDF Standard.\n\n1. Click **Share** in the top-right corner, then **Download**.\n2. Under **File type**, choose **PDF Print**.\n3. Tick **Crop marks and bleed** if your printer needs them, and optionally **Flatten PDF** so text is not editable.\n4. Pick **CMYK** under colour profile if your printer requested it, then click **Download**.\n\nPDF Print keeps images at their full resolution and embeds fonts, so the printer sees exactly what you see. Standard PDFs are compressed for email and web and can look soft when printed.",
  },
  {
    locale: "en",
    intent: "share-edit",
    question: "How do I share a design so my teammate can edit it?",
    answer:
      "You can invite people directly or share an edit link.\n\n1. Open the design and click **Share** in the top-right corner.\n2. Add your teammate's email under **People with access**, set the permission to **Can edit**, and click **Send**.\n3. To share a link instead, open **Collaboration link**, choose **Anyone with the link can edit**, and copy the link.\n\nEditors see changes live and can leave comments. If your teammate only needs to look, choose **Can view** or **Can comment** instead. Team members in the same team can also find shared designs under **Projects > Shared with you**.",
  },
  {
    locale: "en",
    intent: "brand-kit",
    question: "How do I set up a Brand Kit with our logo and colors?",
    answer:
      "A **Brand Kit** keeps your logos, colours and fonts one click away in every design.\n\n1. From the home page, open **Brand** in the left sidebar and choose **Brand Kit**.\n2. Click **Add new** under logos and upload PNG or SVG files with a transparent background.\n3. Under **Brand colours**, click **+** and enter your hex codes, or pick them from an uploaded logo.\n4. Add your fonts under **Brand fonts**, choosing from our library or uploading your own.\n\nEverything you add appears in the editor under **Brand**. You can create several kits on Pro and Teams plans; free accounts get one kit with a small number of colours.",
  },
  {
    locale: "en",
    intent: "remove-background",
    question: "How do I remove the background from a photo?",
    answer:
      "The **Background Remover** does it in one click.\n\n1. Upload your photo and add it to the design.\n2. Select the photo, then click **Edit photo** in the top toolbar.\n3. Choose **BG Remover** and wait a moment while the background is detected and removed.\n4. If a spot was missed, open **Erase** or **Restore** in the same panel and brush over it.\n\nThe result is a transparent PNG, so you can place it over any colour or image. Background Remover is included with Pro and Teams; on the free plan you will see a preview and a prompt to start a trial.",
  },
  {
    locale: "en",
    intent: "teams-billing",
    question: "How does billing work when I add people to my team?",
    answer:
      "Teams is billed **per person**, and new members are added to the next invoice.\n\n1. When you invite someone and they accept, they become a billable seat from that day.\n2. Your next charge is prorated: you pay only for the days each new seat was active in the current cycle.\n3. Removing someone frees the seat immediately, and the credit is applied to your following invoice.\n\nYou can see the current seat count and the upcoming charge under **Settings > Billing & plans**. Pending invitations are not billed until they are accepted. If you need a fixed number of seats for budgeting, an admin can cap invitations under **Team settings**.",
  },
  {
    locale: "en",
    intent: "blurry-download",
    question: "Why is my download blurry?",
    answer:
      "Blurry downloads almost always come from the export settings or a small source image.\n\n1. Click **Share > Download** and choose **PNG** rather than JPG for graphics and text.\n2. Drag the **Size** slider up to 2x or 3x if your design is small, and tick **Transparent background** only if you need it.\n3. Check that any photos in the design are at least as large as the space they fill; zoomed-in small images stay soft no matter the export size.\n\nFor print, use **PDF Print** instead of an image format. If the design still looks sharp in the editor but soft after download, tell us which file type you used and we will check the render.",
  },
  {
    locale: "en",
    intent: "page-numbers",
    question: "How do I add page numbers to a presentation?",
    answer:
      "There is no automatic page numbering yet, but this takes about a minute for a whole deck.\n\n1. On the first slide, add a small **text box** in a corner and type the number.\n2. Select the text box, then choose **Position** to lock its coordinates so it sits in exactly the same place on every slide.\n3. Copy the text box, paste it on each slide with Ctrl/Cmd + V, and update the number.\n\nIf you present with **Presenter view**, the slide counter is shown to you automatically, so numbers on the slides are only needed for exported PDFs or handouts.",
  },
  {
    locale: "en",
    intent: "schedule-post",
    question: "Can I schedule a post to Instagram from here?",
    answer:
      "Yes, the **Content Planner** can publish to Instagram Business accounts on a schedule.\n\n1. Open the design and click **Share**, then choose **Schedule**.\n2. Pick a date and time, then select **Add channel** and connect your Instagram Business account through Facebook.\n3. Write the caption, add hashtags, and click **Schedule post**.\n\nScheduled posts appear in **Content Planner** on the home page, where you can move or delete them. Personal Instagram accounts cannot be connected because of Instagram's API rules; convert to a Business or Creator account first. Content Planner is available on Pro and Teams plans.",
  },
  {
    locale: "pt-BR",
    intent: "export-pdf",
    question: "Como faço para baixar meu design em PDF?",
    answer:
      "Baixar em PDF leva só alguns cliques.\n\n1. Abra o design e clique em **Compartilhar** no canto superior direito.\n2. Selecione **Baixar** e, em **Tipo de arquivo**, escolha **PDF padrão** para envio por e-mail ou **PDF para impressão** para gráficas.\n3. Se a gráfica pediu, marque **Marcas de corte e sangria** e escolha o perfil de cor **CMYK**.\n4. Clique em **Baixar**.\n\nO PDF para impressão mantém as imagens em alta resolução e incorpora as fontes, então o resultado impresso fica igual ao que você vê na tela. Se o arquivo ficou grande demais para enviar, use o PDF padrão, que é comprimido.",
  },
  {
    locale: "pt-BR",
    intent: "cancel-plan",
    question: "Como cancelo minha assinatura Pro?",
    answer:
      "Você pode cancelar a qualquer momento e continua com o Pro até o fim do período já pago.\n\n1. Clique no **ícone de engrenagem** no canto superior direito para abrir as configurações.\n2. No menu à esquerda, selecione **Cobrança e planos**.\n3. Ao lado do plano Pro, clique em **Cancelar assinatura** e confirme.\n\nSeus designs, pastas e uploads continuam na conta. Elementos premium deixam de ser editáveis quando o plano termina e o Kit de Marca volta ao limite gratuito. Se houve alguma cobrança depois do cancelamento, responda aqui com a data da fatura e nós verificamos.",
  },
  {
    locale: "es",
    intent: "resize",
    question: "¿Cómo cambio el tamaño de un diseño ya creado?",
    answer:
      "Con **Cambiar tamaño** puedes crear una copia en otras dimensiones sin tocar el original.\n\n1. Abre el diseño y haz clic en **Cambiar tamaño** en la barra superior.\n2. Busca un formato, por ejemplo **Publicación de Instagram**, o escribe medidas personalizadas en píxeles, milímetros o pulgadas.\n3. Elige **Copiar y cambiar tamaño** para conservar el original, o **Cambiar tamaño de este diseño** para modificarlo directamente.\n\nLos elementos se reubican de forma aproximada, así que revisa los cuadros de texto y las fotos recortadas. Cambiar tamaño es una función de Pro; en el plan gratuito puedes crear un diseño nuevo y copiar los elementos con Ctrl/Cmd + C y V.",
  },
  {
    locale: "de",
    intent: "remove-background",
    question: "Wie entferne ich den Hintergrund von einem Foto?",
    answer:
      "Mit dem **Hintergrund-Entferner** geht das mit einem Klick.\n\n1. Lade dein Foto hoch und ziehe es in das Design.\n2. Wähle das Foto aus und klicke in der oberen Leiste auf **Foto bearbeiten**.\n3. Wähle **Hintergrund-Entferner** und warte einen Moment, bis der Hintergrund erkannt und entfernt ist.\n4. Wurde eine Stelle übersehen, nutze im selben Bereich **Radieren** oder **Wiederherstellen** und male darüber.\n\nDas Ergebnis ist ein transparentes PNG, das du auf jede Farbe oder jedes Bild legen kannst. Der Hintergrund-Entferner ist in Pro und Teams enthalten; im kostenlosen Plan siehst du eine Vorschau und kannst eine Testphase starten.",
  },
];

/** Off-topic requests, tagged "Non-Help Assistant Request". */
const OFF_TOPIC: Question[] = [
  {
    locale: "en",
    intent: "non-help",
    question: "Can you write a birthday poem for my sister?",
    answer:
      "I'm the help assistant for the editor, so I can't write the poem itself, but I can help you turn one into something she will love.\n\n1. Search **Templates** for **birthday card** and pick a layout.\n2. Use **Magic Write** inside a text box to draft the poem; give it her name and a couple of details.\n3. Add a photo, then **Share** or **Download** the card.\n\nIf you need a hand with any of those steps, ask me here.",
  },
  {
    locale: "en",
    intent: "non-help",
    question: "What's the weather in Lisbon tomorrow?",
    answer:
      "I can only help with questions about the editor, your designs and your account, so I can't check the weather. If you are planning a design around it, though, I can help.\n\n1. Search **Elements** for **weather icons** to drop into a story or post.\n2. Use **Resize** to fit the design to the platform you are posting on.\n\nAsk me anything about designing, sharing or your plan and I will walk you through it.",
  },
  {
    locale: "en",
    intent: "non-help",
    question: "Translate this paragraph into French for me.",
    answer:
      "I'm here for help with the editor rather than general translation, but there is a built-in way to do this inside a design.\n\n1. Select the text box you want to translate.\n2. Click **Apps** in the left sidebar and open **Translate**.\n3. Choose **French** and apply it to the selected text or the whole page.\n\nThe translated text keeps your fonts and layout. If a line runs too long, use **Resize** on the text box or shorten it slightly.",
  },
];

type StepKind =
  | { kind: "span"; name: string; min: number; max: number }
  | {
      kind: "generation";
      name: string;
      model: string;
      /** wrapping span name, if the generation sits inside a span */
      wrapper?: string;
      wrapperMin?: number;
      wrapperMax?: number;
      min: number;
      max: number;
      promptTokens: [number, number];
      completionTokens: [number, number];
      /** total cost range in USD; input cost derived as total minus output */
      cost: [number, number];
      ttft?: boolean;
    };

type Step = StepKind & {
  slug: string;
  probability: number;
};

/** Children of "Responding to request", in pipeline order. */
const STEPS: Step[] = [
  {
    slug: "hss",
    probability: 0.5,
    kind: "generation",
    wrapper: "HSS Escalation classification",
    wrapperMin: 500,
    wrapperMax: 700,
    name: "Classify using: policy-agents/hss-escalation",
    model: "gpt-4.1-mini",
    min: 420,
    max: 620,
    promptTokens: [10_050, 10_160],
    completionTokens: [12, 20],
    cost: [0.00155, 0.00165],
  },
  {
    slug: "utterance",
    probability: 0.4,
    kind: "generation",
    name: "Analyzing utterance",
    model: "gpt-4.1-mini",
    min: 1_000,
    max: 1_300,
    promptTokens: [36_600, 37_400],
    completionTokens: [15, 25],
    cost: [0.0085, 0.0089],
  },
  {
    slug: "incident",
    probability: 0.9,
    kind: "span",
    name: "Check Incident",
    min: 50,
    max: 150,
  },
  {
    slug: "quick-actions",
    probability: 0.9,
    kind: "generation",
    wrapper: "Classify quick actions",
    wrapperMin: 350,
    wrapperMax: 800,
    name: "Select actions from intent actions",
    model: "gpt-4.1-mini",
    min: 300,
    max: 720,
    promptTokens: [290, 660],
    completionTokens: [9, 10],
    cost: [0.0007, 0.0014],
  },
  {
    slug: "generate",
    probability: 0.8,
    kind: "generation",
    name: "Generate content-based",
    model: "gpt-4.1",
    min: 1_100,
    max: 2_400,
    promptTokens: [20_000, 40_000],
    completionTokens: [137, 207],
    cost: [0.011, 0.06],
    ttft: true,
  },
  {
    slug: "sources",
    probability: 0.4,
    kind: "span",
    name: "Get Source Articles",
    min: 180,
    max: 250,
  },
  {
    slug: "tour",
    probability: 0.3,
    kind: "generation",
    wrapper: "Emit relevant guided tour",
    wrapperMin: 560,
    wrapperMax: 660,
    name: "Classifying guided tour action",
    model: "gpt-4.1-mini",
    min: 480,
    max: 580,
    promptTokens: [2_900, 3_100],
    completionTokens: [19, 19],
    cost: [0.00135, 0.00145],
  },
  {
    slug: "bug-wish-classify",
    probability: 0.3,
    kind: "generation",
    name: "Bug/wish classification",
    model: "gpt-4.1-mini",
    min: 420,
    max: 580,
    promptTokens: [570, 590],
    completionTokens: [1, 1],
    cost: [0.00115, 0.00125],
  },
  {
    slug: "bug-wish",
    probability: 0.8,
    kind: "span",
    name: "bug-wish",
    min: 20,
    max: 80,
  },
];

const VOICE_TONE_COMMENTS: Record<string, string> = {
  "1": "Warm, direct and free of jargon; matches the product voice guide.",
  "0.5": "Helpful but a little formal; a contraction or two would soften it.",
  "0": "Reads like a policy document; misses the friendly guide voice.",
};

const FRUSTRATION_COMMENTS: Record<string, string> = {
  "0": "No sign of frustration; a neutral how-to question.",
  "0.25": "Mild impatience in the phrasing; resolved by a direct answer.",
  "0.5":
    "User implies an earlier attempt did not work; answer acknowledges it.",
};

const LANGUAGE_PARITY_COMMENT =
  "Answer language matches the language of the question.";

const SYSTEM_PROMPT =
  "You are the in-product help assistant for a design editor. Answer only from the provided help articles, in the user's language, with numbered steps where useful. Never invent features.";

const hex = (rng: Rng, length: number): string => {
  let out = "";
  for (let i = 0; i < length; i++) out += rng.int(0, 15).toString(16);
  return out;
};

const uuid = (rng: Rng): string =>
  `${hex(rng, 8)}-${hex(rng, 4)}-4${hex(rng, 3)}-${["8", "9", "a", "b"][rng.int(0, 3)]}${hex(rng, 3)}-${hex(rng, 12)}`;

const between = (seed: number, index: number, min: number, max: number) =>
  min + jitter(seed, index, max - min);

const round = (value: number, digits: number) =>
  Math.round(value * 10 ** digits) / 10 ** digits;

type SessionPlan = {
  id: string;
  userId: string;
  locale: Locale;
  country: string;
  roles: readonly string[];
  subscription: string;
  size: number;
};

const SESSION_SIZES = [1, 1, 1, 2, 2, 3, 4, 5] as const;

const planSessions = (rng: Rng, count: number): SessionPlan[] => {
  const sessions: SessionPlan[] = [];
  let assigned = 0;
  while (assigned < count) {
    const locale = rng.pick(LOCALES);
    const size = Math.min(rng.pick(SESSION_SIZES), count - assigned);
    sessions.push({
      id: uuid(rng),
      userId: hex(rng, 16),
      locale,
      country: rng.pick(COUNTRIES[locale]),
      roles: rng.pick(ROLE_SETS),
      subscription: rng.pick(SUBSCRIPTIONS),
      size,
    });
    assigned += size;
  }
  return sessions;
};

type UsageBlock = {
  provided_usage_details: Record<string, number>;
  usage_details: Record<string, number>;
  provided_cost_details: Record<string, number>;
  cost_details: Record<string, number>;
  total_cost: number | null;
};

const emptyUsage: UsageBlock = {
  provided_usage_details: {},
  usage_details: {},
  provided_cost_details: {},
  cost_details: {},
  total_cost: null,
};

/**
 * Explicit usage and cost so cost renders even when the local model table has
 * no price for gpt-4.1 / gpt-4.1-mini. The observed totals do not follow list
 * prices (cached prompt tokens), so the caller passes the total and the output
 * side is priced at list rate with the remainder attributed to input.
 */
const usageCost = (
  input: number,
  output: number,
  totalCost: number,
  outputCost: number,
): UsageBlock => {
  const costs = {
    input: round(totalCost - outputCost, 8),
    output: round(outputCost, 8),
  };
  return {
    provided_usage_details: { input, output, total: input + output },
    usage_details: { input, output, total: input + output },
    provided_cost_details: costs,
    cost_details: { ...costs, total: round(totalCost, 8) },
    total_cost: round(totalCost, 8),
  };
};

/** Roll-up carried by "Responding to request" and the root: totals only. */
const rollupUsage = (
  input: number,
  output: number,
  totalCost: number,
): UsageBlock => ({
  provided_usage_details: { input, output, total: input + output },
  usage_details: { input, output, total: input + output },
  provided_cost_details: { total: round(totalCost, 8) },
  cost_details: { total: round(totalCost, 8) },
  total_cost: round(totalCost, 8),
});

const run = async (
  ctx: ScenarioContext,
  params: Record<string, string | number | boolean>,
): Promise<SeedSummary> => {
  const startedAt = Date.now();
  const withV4 = params["v4"] as boolean;
  const count = Number(params["count"]);
  if (!Number.isInteger(count) || count < 1) {
    throw new SeedError(`--count must be a positive integer, got ${count}`);
  }
  const environment =
    ctx.environment === "default" ? DEFAULT_ENVIRONMENT : ctx.environment;

  // Anchor on the current UTC hour so same-hour re-runs overwrite in place
  // (events_full sorts on start_time), then spread the traces uniformly over
  // the three hours before it.
  const hourStart = Math.floor(Date.now() / 3_600_000) * 3_600_000;
  const windowStart = hourStart - WINDOW_MS;
  const spacing = Math.floor(WINDOW_MS / count);
  const traceTimestampOf = (index: number) =>
    windowStart +
    index * spacing +
    jitter(ctx.seed, 700_000 + index, Math.floor(spacing * 0.8));

  // Sessions come from their own stream so --count only appends.
  const sessions = planSessions(new Rng(ctx.seed + 15_485_863), count);
  const sessionOfTrace: SessionPlan[] = [];
  for (const session of sessions) {
    for (let k = 0; k < session.size; k++) sessionOfTrace.push(session);
  }

  const traces: TraceRecordInsertType[] = [];
  const observations: ObservationRecordInsertType[] = [];
  const scores: ScoreRecordInsertType[] = [];
  const counts: Record<string, number> = {
    traces: 0,
    sessions: sessions.length,
    users: new Set(sessions.map((s) => s.userId)).size,
    observations: 0,
    generations: 0,
    scores: 0,
    events: 0,
  };
  for (const step of STEPS) counts[`traces:${step.slug}`] = 0;
  counts["traces:non-help"] = 0;
  counts["traces:pt-BR"] = 0;

  const exampleLinks: Record<"hss" | "tour" | "pt-BR", string | null> = {
    hss: null,
    tour: null,
    "pt-BR": null,
  };

  for (let i = 0; i < count; i++) {
    // Own stream per trace: --count must not re-key earlier traces.
    const rng = new Rng(ctx.seed + i * 7_919);
    const session = sessionOfTrace[i]!;
    const traceId = `${ctx.idPrefix}-t${i}`;
    const traceTimestamp = traceTimestampOf(i);
    const j = (slot: number, min: number, max: number) =>
      between(ctx.seed, i * 64 + slot, min, max);

    const nonHelp = rng.bool(0.15);
    const pool = nonHelp
      ? OFF_TOPIC
      : QUESTIONS.filter((q) => q.locale === session.locale);
    const question = rng.pick(pool);
    const release = rng.pick(RELEASES);
    const tags = nonHelp
      ? ["Non-Help Assistant Request"]
      : ["Magic Answers", LANGUAGE_TAG[session.locale]];
    const included = STEPS.map((step) => rng.bool(step.probability));

    const traceObservations: ObservationRecordInsertType[] = [];
    const traceScores: ScoreRecordInsertType[] = [];
    const base = {
      trace_id: traceId,
      project_id: ctx.projectId,
      environment,
      level: "DEFAULT" as const,
      status_message: null,
      version: null,
      internal_model_id: null,
      model_parameters: "{}",
      prompt_id: null,
      prompt_name: null,
      prompt_version: null,
      created_at: Date.now(),
      updated_at: Date.now(),
      event_ts: Date.now(),
    };
    const push = (
      id: string,
      args: {
        type: ObservationType;
        name: string;
        parent: string | null;
        start: number;
        end: number;
        ttft?: number;
        input: unknown;
        output: unknown;
        model?: string;
        usage?: UsageBlock;
        metadata?: Record<string, string>;
      },
    ) => {
      traceObservations.push(
        createObservation({
          ...base,
          id,
          type: args.type,
          parent_observation_id: args.parent,
          name: args.name,
          start_time: traceTimestamp + args.start,
          end_time: traceTimestamp + args.end,
          completion_start_time:
            args.ttft !== undefined ? traceTimestamp + args.ttft : null,
          input: JSON.stringify(args.input),
          output: JSON.stringify(args.output),
          metadata: { scenario: "help-assistant", ...args.metadata },
          provided_model_name: args.model ?? null,
          ...(args.usage ?? emptyUsage),
        }),
      );
    };

    const rootId = `${traceId}-root`;
    const gatherId = `${traceId}-gather`;
    const respondId = `${traceId}-respond`;

    // Gather context, then Responding to request; steps run sequentially
    // inside the latter with small gaps.
    const gatherStart = j(0, 20, 60);
    const gatherEnd = gatherStart + j(1, 170, 810);
    push(gatherId, {
      type: "SPAN",
      name: "Gather context",
      parent: rootId,
      start: gatherStart,
      end: gatherEnd,
      input: {
        userId: session.userId,
        locale: session.locale,
        surface: "editor",
      },
      output: {
        articlesIndexed: 1_240 + j(2, 0, 40),
        recentDesigns: j(3, 0, 12),
        subscription: session.subscription,
      },
    });

    const respondStart = gatherEnd + j(4, 10, 40);
    let cursor = respondStart + j(5, 5, 20);
    let totalCost = 0;
    let totalInput = 0;
    let totalOutput = 0;
    let generateId: string | null = null;

    STEPS.forEach((step, s) => {
      if (!included[s]) return;
      counts[`traces:${step.slug}`]! += 1;
      const slot = 10 + s * 5;
      const stepId = `${traceId}-${step.slug}`;

      if (step.kind === "span") {
        const end = cursor + j(slot, step.min, step.max);
        push(stepId, {
          type: "SPAN",
          name: step.name,
          parent: respondId,
          start: cursor,
          end,
          input: { intent: question.intent, locale: session.locale },
          output:
            step.slug === "incident"
              ? { service: "help-assistant", activeIncidents: [] }
              : step.slug === "sources"
                ? {
                    articles: [
                      {
                        id: `art_${hex(rng, 6)}`,
                        title: question.question,
                        locale: session.locale,
                      },
                      { id: `art_${hex(rng, 6)}`, title: "Download settings" },
                    ],
                  }
                : { classification: "none", stored: false },
        });
        cursor = end + j(slot + 1, 5, 40);
        return;
      }

      const promptTokens = rng.int(step.promptTokens[0], step.promptTokens[1]);
      const completionTokens = rng.int(
        step.completionTokens[0],
        step.completionTokens[1],
      );
      // Cost scales with the prompt size inside the observed range.
      const span = step.promptTokens[1] - step.promptTokens[0];
      const t = span === 0 ? 0.5 : (promptTokens - step.promptTokens[0]) / span;
      const cost = step.cost[0] + t * (step.cost[1] - step.cost[0]);
      const usage = usageCost(
        promptTokens,
        completionTokens,
        cost,
        completionTokens * MODEL_OUTPUT_PRICE[step.model]!,
      );
      totalCost += usage.total_cost ?? 0;
      totalInput += promptTokens;
      totalOutput += completionTokens;
      counts.generations! += 1;

      const generationDuration = j(slot, step.min, step.max);
      let genStart = cursor;
      let parent = respondId;
      let wrapperEnd = cursor;
      if (step.wrapper) {
        const wrapperDuration = Math.max(
          j(slot + 1, step.wrapperMin!, step.wrapperMax!),
          generationDuration + 40,
        );
        wrapperEnd = cursor + wrapperDuration;
        genStart =
          cursor + j(slot + 2, 10, wrapperDuration - generationDuration - 10);
        parent = `${stepId}-span`;
        push(parent, {
          type: "SPAN",
          name: step.wrapper,
          parent: respondId,
          start: cursor,
          end: wrapperEnd,
          input: { question: question.question, intent: question.intent },
          output:
            step.slug === "hss"
              ? { escalate: false, reason: "self-serve how-to" }
              : step.slug === "tour"
                ? { tour: `${question.intent}-tour`, emitted: true }
                : { actions: [`open-${question.intent}`, "show-article"] },
        });
      }
      const genEnd = genStart + generationDuration;
      const isGenerate = step.slug === "generate";
      const genOutput = isGenerate
        ? { role: "assistant", content: question.answer }
        : step.slug === "hss"
          ? {
              role: "assistant",
              content: '{"escalate": false, "confidence": 0.97}',
            }
          : step.slug === "utterance"
            ? {
                role: "assistant",
                content: `{"intent": "${question.intent}", "sentiment": "neutral"}`,
              }
            : step.slug === "quick-actions"
              ? {
                  role: "assistant",
                  content: `["open-${question.intent}", "show-article"]`,
                }
              : step.slug === "tour"
                ? { role: "assistant", content: `${question.intent}-tour` }
                : { role: "assistant", content: "0" };
      const genInput = [
        {
          role: "system",
          content: isGenerate
            ? SYSTEM_PROMPT
            : `Classify the user request for the "${step.name}" step. Reply with the label only.`,
        },
        { role: "user", content: question.question },
      ];
      push(stepId, {
        type: "GENERATION",
        name: step.name,
        parent,
        start: genStart,
        end: genEnd,
        ttft: step.ttft
          ? genStart + Math.floor(generationDuration * 0.35)
          : undefined,
        input: genInput,
        output: genOutput,
        model: step.model,
        usage,
        metadata: { ls_provider: "openai" },
      });
      if (isGenerate) generateId = stepId;

      cursor = (step.wrapper ? wrapperEnd : genEnd) + j(slot + 3, 5, 40);
    });

    const respondEnd = cursor + j(60, 10, 30);
    const rootEnd = respondEnd + j(61, 10, 40);
    const aggregated =
      totalCost > 0
        ? rollupUsage(totalInput, totalOutput, totalCost)
        : undefined;

    push(respondId, {
      type: "SPAN",
      name: "Responding to request",
      parent: rootId,
      start: respondStart,
      end: respondEnd,
      input: { question: question.question, locale: session.locale },
      output: { status: "COMPLETE", steps: included.filter(Boolean).length },
      usage: aggregated,
    });
    push(rootId, {
      type: "SPAN",
      name: "Help Assistant",
      parent: null,
      start: 0,
      end: rootEnd,
      input: question.question,
      output: question.answer,
      usage: aggregated,
    });

    // Scores live on the answer generation only: EVAL source, three names.
    if (generateId) {
      const scoreBase = {
        project_id: ctx.projectId,
        trace_id: traceId,
        observation_id: generateId,
        environment,
        source: "EVAL" as const,
        data_type: "NUMERIC" as const,
        metadata: {},
        created_at: Date.now(),
        updated_at: Date.now(),
        event_ts: Date.now(),
      };
      const scoreTime = traceTimestamp + rootEnd + 30_000;
      const voice = rng.pick([1, 1, 1, 1, 1, 1, 1, 1, 0.5, 0.5, 0.5, 0]);
      const frustration = rng.pick([0, 0, 0, 0, 0, 0, 0, 0.25, 0.25, 0.5]);
      traceScores.push(
        createTraceScore({
          ...scoreBase,
          id: `${generateId}-score-voice-tone`,
          name: "Canva Voice & Tone",
          value: voice,
          comment: VOICE_TONE_COMMENTS[String(voice)]!,
          timestamp: scoreTime,
        }),
        createTraceScore({
          ...scoreBase,
          id: `${generateId}-score-frustration`,
          name: "Frustration Index",
          value: frustration,
          comment: FRUSTRATION_COMMENTS[String(frustration)]!,
          timestamp: scoreTime + 1_000,
        }),
      );
      if (rng.bool(0.6)) {
        traceScores.push(
          createTraceScore({
            ...scoreBase,
            id: `${generateId}-score-language-parity`,
            name: "Language Parity",
            value: 1,
            comment: LANGUAGE_PARITY_COMMENT,
            timestamp: scoreTime + 2_000,
          }),
        );
      }
    }

    traces.push(
      createTrace({
        id: traceId,
        project_id: ctx.projectId,
        environment,
        name: "Help Assistant",
        timestamp: traceTimestamp,
        user_id: session.userId,
        session_id: session.id,
        release,
        version: "help-assistant-v7",
        tags,
        public: false,
        bookmarked: false,
        // Nested objects are stored as JSON strings per top-level key, as the
        // ingestion pipeline does.
        metadata: {
          user: JSON.stringify({
            roles: session.roles,
            locale: session.locale,
            country: session.country,
          }),
          subscription: JSON.stringify({ type: session.subscription }),
          response: JSON.stringify({ status: "COMPLETE" }),
        },
        input: JSON.stringify(question.question),
        output: JSON.stringify(question.answer),
        created_at: Date.now(),
        updated_at: Date.now(),
        event_ts: Date.now(),
      }),
    );
    observations.push(...traceObservations);
    scores.push(...traceScores);

    counts.traces! += 1;
    counts.observations! += traceObservations.length;
    counts.scores! += traceScores.length;
    counts.events! += withV4 ? traceObservations.length + 1 : 0;
    if (nonHelp) counts["traces:non-help"]! += 1;
    if (session.locale === "pt-BR" && !nonHelp) counts["traces:pt-BR"]! += 1;

    const link = traceLink(ctx, traceId, traceTimestamp);
    if (!exampleLinks.hss && included[0]) exampleLinks.hss = link;
    if (!exampleLinks.tour && included[6] && link !== exampleLinks.hss) {
      exampleLinks.tour = link;
    }
    if (
      !exampleLinks["pt-BR"] &&
      session.locale === "pt-BR" &&
      !nonHelp &&
      included[4]
    ) {
      exampleLinks["pt-BR"] = link;
    }
  }

  // Links: the trace list, then one example each with the HSS escalation
  // branch, the guided-tour branch, and an answered Portuguese question (when
  // present).
  const links = [
    tracesListLink(ctx),
    ...[exampleLinks.hss, exampleLinks.tour, exampleLinks["pt-BR"]].filter(
      (l): l is string => l !== null,
    ),
  ];
  const sessionIds = sessions.map((s) => s.id);

  if (ctx.dryRun) {
    return {
      scenario: "help-assistant",
      target: "clickhouse",
      params,
      projectId: ctx.projectId,
      environment,
      traceIds: traces.map((t) => t.id),
      sessionIds,
      counts,
      verified: {},
      links,
      dryRun: true,
      durationMs: Date.now() - startedAt,
    };
  }

  ctx.log(
    `writing ${sessions.length} sessions, ${traces.length} traces, ${observations.length} observations, ${scores.length} scores${withV4 ? `, ${counts.events} events` : ""}`,
  );

  // Session detail 404s without the Postgres trace_sessions row.
  for (const batch of chunk(sessions, 200)) {
    await prisma.$transaction(
      batch.map((session) =>
        prisma.traceSession.upsert({
          where: {
            id_projectId: { id: session.id, projectId: ctx.projectId },
          },
          update: {},
          create: {
            id: session.id,
            projectId: ctx.projectId,
            environment,
            createdAt: new Date(windowStart),
          },
        }),
      ),
    );
  }

  for (const batch of chunk(traces, 1000)) {
    await createTracesCh(batch);
  }
  for (const batch of chunk(observations, 1000)) {
    await createObservationsCh(batch);
  }
  for (const batch of chunk(scores, 1000)) {
    await createScoresCh(batch);
  }
  if (withV4) {
    const traceById = new Map(traces.map((t) => [t.id, t]));
    const events = [
      ...traces.map((trace) => traceToEvent(trace)),
      ...observations.map((o) =>
        observationToEvent(o, traceById.get(o.trace_id!)!),
      ),
    ];
    for (const batch of chunk(events, 500)) {
      await createEventsCh(batch);
    }
  }

  // uniqExact(id): count() would see pre-merge ReplacingMergeTree duplicates
  // after re-runs with the same id prefix.
  const traceIds = traces.map((t) => t.id);
  const byTrace = `project_id = {projectId: String} AND trace_id IN {traceIds: Array(String)}`;
  const args = { projectId: ctx.projectId, traceIds };
  const verified: Record<string, number> = {
    traces: await countRows(
      "traces",
      `project_id = {projectId: String} AND id IN {traceIds: Array(String)}`,
      args,
      "uniqExact(id)",
    ),
    observations: await countRows(
      "observations",
      byTrace,
      args,
      "uniqExact(id)",
    ),
    generations: await countRows(
      "observations",
      `${byTrace} AND type = 'GENERATION'`,
      args,
      "uniqExact(id)",
    ),
    scores: await countRows("scores", byTrace, args, "uniqExact(id)"),
  };
  if (withV4) {
    verified.events = await countRows(
      "events_full",
      byTrace,
      args,
      "uniqExact(span_id)",
    );
  }
  for (const key of [
    "traces",
    "observations",
    "generations",
    "scores",
  ] as const) {
    if (verified[key]! < counts[key]!) {
      throw new SeedError(
        `Readback mismatch: expected ${counts[key]} ${key}, found ${verified[key]}`,
        "re-run; if it persists, check the ClickHouse the CLI is pointed at",
      );
    }
  }
  if (withV4 && verified.events! < counts.events!) {
    throw new SeedError(
      `Readback mismatch: expected ${counts.events} events_full rows, found ${verified.events}`,
    );
  }

  return {
    scenario: "help-assistant",
    target: "clickhouse",
    params,
    projectId: ctx.projectId,
    environment,
    traceIds,
    sessionIds,
    counts,
    verified,
    links,
    dryRun: false,
    durationMs: Date.now() - startedAt,
  };
};

export const helpAssistantScenario: ScenarioDefinition = {
  name: "help-assistant",
  description:
    'Production-shaped traces from a design tool\'s in-product help assistant, spread over the last three hours in sessions of 1-5 per user: root SPAN "Help Assistant" (question in, markdown answer out; env "prod", release, version, tags, nested user/subscription metadata) wrapping "Gather context" and a "Responding to request" pipeline whose classifier / generator steps (gpt-4.1-mini escalation, utterance, quick-action, guided-tour and bug/wish classifiers; gpt-4.1 answer generation) each appear with their observed probability. Only the answer generation carries scores (EVAL: "Canva Voice & Tone", "Frustration Index", "Language Parity"); costs roll up onto "Responding to request" and the root as the customer\'s instrumentation does. Links: trace list, then one example each with the escalation branch, the guided-tour branch, and a Portuguese question.',
  supportsV4: true,
  flags: [
    {
      flag: "count",
      type: "number",
      default: 80,
      description: "number of traces spread over the last three hours",
    },
    {
      flag: "v4",
      type: "boolean",
      default: false,
      description: "also mirror into v4 events_full/events_core",
    },
  ],
  run,
};
