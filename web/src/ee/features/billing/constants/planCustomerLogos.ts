import { type CloudPlan } from "@/src/ee/features/billing/constants/pricingPlans";

/** `image` is a square logo under the app's public folder. */
type CustomerLogo = { name: string; image: string };

const logo = (file: string) => `/assets/customer-logos/${file}.png`;

const proCustomers: ReadonlyArray<CustomerLogo> = [
  { name: "Canva", image: logo("canva") },
  { name: "Twilio", image: logo("twilio") },
  { name: "SumUp", image: logo("sumup") },
  { name: "Brevo", image: logo("brevo") },
];

/**
 * The customers the pricing page names under each plan, in its order. Copied
 * from langfuse-docs data/trusted-by.ts at 23283366f (2026-11-25); the logos
 * are its public/images/customers/pricing-logos files.
 */
export const planCustomerLogos: Record<
  CloudPlan,
  ReadonlyArray<CustomerLogo>
> = {
  "cloud:hobby": [{ name: "Hugging Face", image: logo("huggingface") }],
  "cloud:core": [
    { name: "Magic Patterns", image: logo("magicpatterns") },
    { name: "Draftbit", image: logo("draftbit") },
  ],
  "cloud:pro": proCustomers,
  // The pricing page names customers under Pro, which the Teams add-on builds on.
  "cloud:team": proCustomers,
  "cloud:enterprise": [
    { name: "Ramp", image: logo("ramp") },
    { name: "GoDaddy", image: logo("godaddy") },
    { name: "Khan Academy", image: logo("khanacademy") },
    { name: "Merck Group", image: logo("merckgroup") },
  ],
};
