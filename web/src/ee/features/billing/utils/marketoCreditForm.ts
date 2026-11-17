/**
 * Browser-side delivery of a coupon redemption through ClickHouse's Marketo
 * credit-request form. The form never renders: it lives in a hidden element
 * outside React's tree, receives the values the user confirmed on the
 * Langfuse page, and submits through Marketo's own cross-domain frame. GTM
 * systems then validate the code and grant the credits via Salesforce.
 *
 * The script and stylesheets load from MARKETO_ORIGIN, which the app's
 * Content-Security-Policy allows on Langfuse Cloud.
 */
const MARKETO_ORIGIN = "https://discover.clickhouse.com";
const MARKETO_MUNCHKIN_ID = "238-FPC-317";
const MARKETO_FORM_ID = 1839;
const MARKETO_TIMEOUT_MS = 20_000;

export type MarketoCreditRequest = {
  firstName: string;
  lastName: string;
  submitterEmail: string;
  clickhouseOrganizationId: string;
  /** The program name GTM matches on, resolved from the code on the server. */
  program: string;
  couponCode: string;
};

/** A failure on Marketo's side, shown to the user without a Sentry event. */
export class MarketoCreditFormError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MarketoCreditFormError";
  }
}

/** The subset of the Forms 2.0 API this module uses. */
type MarketoForm = {
  setValues(values: Record<string, string>): void;
  getValues(): Record<string, string>;
  validate(): boolean;
  submit(): void;
  /** Called with the values Marketo submitted. */
  onSuccess(callback: (submitted: Record<string, string>) => boolean): void;
};

type MarketoGlobal = {
  MktoForms2?: {
    loadForm(
      baseUrl: string,
      munchkinId: string,
      formId: number,
      onReady: (form: MarketoForm) => void,
    ): void;
  };
};

type PendingSubmission = {
  values: Record<string, string>;
  resolve: () => void;
};

let formPromise: Promise<MarketoForm> | null = null;
let pendingSubmission: PendingSubmission | null = null;

const withTimeout = <T>(promise: Promise<T>, message: string) =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new MarketoCreditFormError(message)),
      MARKETO_TIMEOUT_MS,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });

const loadFormOnce = (): Promise<MarketoForm> => {
  // Marketo renders into `form#mktoForm_<id>` and keeps writing to it, so the
  // element sits outside React, where no re-render can replace it.
  const element = document.createElement("form");
  element.id = `mktoForm_${MARKETO_FORM_ID}`;
  element.hidden = true;
  const script = document.createElement("script");
  script.src = `${MARKETO_ORIGIN}/js/forms2/js/forms2.min.js`;
  script.async = true;

  const loading = new Promise<MarketoForm>((resolve, reject) => {
    script.onerror = () =>
      reject(
        new MarketoCreditFormError(
          "The coupon form could not be loaded. Allow discover.clickhouse.com in your ad or tracker blocker, then try again.",
        ),
      );
    script.onload = () => {
      const marketo = (window as MarketoGlobal).MktoForms2;
      if (!marketo) {
        reject(
          new MarketoCreditFormError("The coupon form could not be loaded."),
        );
        return;
      }
      marketo.loadForm(
        MARKETO_ORIGIN,
        MARKETO_MUNCHKIN_ID,
        MARKETO_FORM_ID,
        (form) => {
          form.onSuccess((submitted) => {
            // A late confirmation of a timed-out submission must not settle
            // a retry that sent different values.
            const pending = pendingSubmission;
            if (
              pending &&
              Object.entries(pending.values).every(
                ([name, value]) => submitted[name] === value,
              )
            ) {
              pending.resolve();
            }
            // Stay on the page instead of following the form's redirect.
            return false;
          });
          resolve(form);
        },
      );
    };
  });

  document.body.appendChild(element);
  document.head.appendChild(script);
  return withTimeout(
    loading,
    "The coupon form did not load. Check your connection and try again.",
  ).catch((error: unknown) => {
    // A retry starts from a clean document, without a second form element.
    element.remove();
    script.remove();
    throw error;
  });
};

const loadForm = () => {
  if (!formPromise) {
    formPromise = loadFormOnce().catch((error: unknown) => {
      formPromise = null;
      throw error;
    });
  }
  return formPromise;
};

/**
 * Submits one credit request. Resolves once Marketo has accepted the
 * submission; whether the code is valid is decided later by GTM systems.
 */
export async function submitMarketoCreditRequest(
  request: MarketoCreditRequest,
): Promise<void> {
  const form = await loadForm();
  const values: Record<string, string> = {
    FirstName: request.firstName,
    LastName: request.lastName,
    Email: request.submitterEmail,
    emailMerge1: request.clickhouseOrganizationId,
    emailMerge3: request.program,
    yCombinatorSecretCode: request.couponCode,
  };
  form.setValues(values);

  // Marketo can ignore programmatic values for fields that disable prefill.
  const stored = form.getValues();
  if (Object.entries(values).some(([name, value]) => stored[name] !== value)) {
    throw new MarketoCreditFormError(
      "The coupon could not be submitted. Please contact support.",
    );
  }
  if (!form.validate()) {
    throw new MarketoCreditFormError(
      "The coupon details were rejected. Check them and try again.",
    );
  }

  let submission: PendingSubmission | null = null;
  try {
    await withTimeout(
      new Promise<void>((resolve) => {
        submission = { values, resolve };
        pendingSubmission = submission;
        form.submit();
      }),
      "The coupon was not confirmed in time. Try again, or contact support if this keeps happening.",
    );
  } finally {
    if (pendingSubmission === submission) pendingSubmission = null;
  }
}
