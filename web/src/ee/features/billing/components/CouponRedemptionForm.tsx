import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import * as z from "zod";

import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Form } from "@/src/components/design-system/Form/Form";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { api } from "@/src/utils/api";
import { captureUnknownError } from "@/src/utils/captureUnknownError";

import {
  COUPON_PROGRAM_LABELS,
  COUPON_PROGRAMS,
  CouponCodeSchema,
  CouponProgramSchema,
} from "../utils/coupons";
import {
  MarketoCreditFormError,
  submitMarketoCreditRequest,
} from "../utils/marketoCreditForm";

const couponFormSchema = z.object({
  program: z.string().min(1, "Select a program").pipe(CouponProgramSchema),
  couponCode: CouponCodeSchema,
  firstName: z.string().trim().min(1, "Enter your first name").max(100),
  lastName: z.string().trim().min(1, "Enter your last name").max(100),
});

type CouponFormInput = z.input<typeof couponFormSchema>;
type CouponFormOutput = z.output<typeof couponFormSchema>;

const programOptions = COUPON_PROGRAMS.map((program) => ({
  value: program,
  label: COUPON_PROGRAM_LABELS[program],
}));

export type CouponRedemptionFormProps = {
  orgId: string;
  submitterEmail: string;
  clickhouseOrganizationId: string;
  /** Prefilled from the redemption link and the account name. */
  initialValues: CouponFormInput;
};

export function CouponRedemptionForm({
  orgId,
  submitterEmail,
  clickhouseOrganizationId,
  initialValues,
}: CouponRedemptionFormProps) {
  const capture = usePostHogClientCapture();
  const form = useForm<CouponFormInput, undefined, CouponFormOutput>({
    resolver: zodResolver(couponFormSchema),
    defaultValues: initialValues,
  });
  // Ineligible orgs surface through the default tRPC error toast.
  const prepare = api.cloudBilling.prepareCouponRedemption.useMutation();
  const deliver = useMutation({
    mutationFn: submitMarketoCreditRequest,
    meta: { toastOperation: "billing_coupon.submit" },
    onSuccess: (_, request) =>
      capture("billing_coupon:submitted", {
        program: request.program,
        isPrefilled: Boolean(initialValues.couponCode),
      }),
    onError: (error) => {
      // Marketo outages and blocked scripts are third-party transport
      // failures: the toast is the whole response. Anything else is ours.
      const isMarketoFailure = error instanceof MarketoCreditFormError;
      if (!isMarketoFailure) captureUnknownError("billing", error);
      showErrorToast(
        "Coupon could not be sent",
        isMarketoFailure
          ? error.message
          : "Something went wrong. Please try again.",
        {
          operation: "billing_coupon.submit",
          errorOrigin: isMarketoFailure ? "network" : "frontend",
          errorCategory: isMarketoFailure ? "transient" : "internal",
        },
      );
    },
  });

  if (deliver.isSuccess) {
    return (
      <Alert variant="info">
        <Alert.Title>Coupon submitted</Alert.Title>
        <Alert.Description>
          {`We received your ${COUPON_PROGRAM_LABELS[deliver.variables.program]} coupon. ClickHouse reviews it and emails you at ${submitterEmail} whether it was approved. Approved credits are applied to this organization.`}
        </Alert.Description>
      </Alert>
    );
  }

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <p className="text-muted-foreground text-sm">
        {`The coupon is sent to ClickHouse's credit-request form together with your name, your email address (${submitterEmail}) and your ClickHouse organization ID (${clickhouseOrganizationId}), so the credits land on this organization. ClickHouse reviews the request and emails you whether it was approved.`}
      </p>
      <Form
        onSubmit={form.handleSubmit(({ firstName, lastName, ...coupon }) =>
          prepare.mutate(
            { orgId, ...coupon },
            {
              onSuccess: (payload) =>
                deliver.mutate({ ...payload, firstName, lastName }),
            },
          ),
        )}
        actions={[
          {
            id: "redeem",
            type: "submit",
            text: "Redeem coupon",
            loading: prepare.isPending || deliver.isPending,
          },
        ]}
      >
        <Form.SelectInputField
          control={form.control}
          name="program"
          label="Program"
          required
          placeholder="Select a program"
          options={programOptions}
        />
        <Form.InputField
          control={form.control}
          name="couponCode"
          label="Coupon code"
          description="The code you received after your program application was approved."
          required
          maxLength={100}
          autoComplete="off"
        />
        <Form.InputField
          control={form.control}
          name="firstName"
          label="First name"
          required
          maxLength={100}
          autoComplete="given-name"
        />
        <Form.InputField
          control={form.control}
          name="lastName"
          label="Last name"
          required
          maxLength={100}
          autoComplete="family-name"
        />
      </Form>
    </div>
  );
}
