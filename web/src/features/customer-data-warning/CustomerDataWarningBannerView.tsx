import {
  customerDataWarningText,
  type CustomerDataWarning,
} from "./getCustomerDataWarning";

/**
 * Top-of-page strip for ClickHouse and Langfuse staff viewing a customer
 * project or organization through admin or support access. Same placement and shape as the preview
 * deployment strip, in amber so the two cannot be confused. It is not
 * dismissible.
 */
export function CustomerDataWarningBannerView(warning: CustomerDataWarning) {
  return (
    <div
      className="ph-no-capture border-customer-data-banner-border bg-customer-data-banner text-customer-data-banner-foreground flex w-full items-center justify-center border-b px-4 py-1"
      role="status"
    >
      <p className="text-center text-sm text-balance">
        {customerDataWarningText(warning)}
      </p>
    </div>
  );
}
