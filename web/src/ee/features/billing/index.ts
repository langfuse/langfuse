// The billing feature's public client surface (RFC rule 8). Named
// re-exports only — the upgrade page and cloud-billing hook other
// features already imported by file path.
//
// BillingSettings stays off this door: OrganizationSettingsPage is the
// only consumer, and putting the settings page here would pull billing
// UI into every SupportOrUpgradePage importer. isCloudBillingEnabled
// stays a deep import for server callers (rule 10) — it shares a module
// with the client hook. stripeCatalogue, chbProjectEvents, and
// resolveBillingService live on server/index.ts.
export { SupportOrUpgradePage } from "@/src/ee/features/billing/components/SupportOrUpgradePage";
export { useIsCloudBillingAvailable } from "@/src/ee/features/billing/utils/isCloudBilling";
