import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";

import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Form } from "@/src/components/design-system/Form/Form";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { api } from "@/src/utils/api";

import {
  COUPON_PROGRAM_LABELS,
  COUPON_PROGRAMS,
  CouponCodeSchema,
  CouponProgramSchema,
} from "../utils/coupons";

const couponFormSchema = z.object({
  program: z.string().min(1, "Select a program").pipe(CouponProgramSchema),
  couponCode: CouponCodeSchema,
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
  /** Prefilled from the redemption link, so the user only has to confirm. */
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
  // Failures surface through the default tRPC error toast.
  const mutation = api.cloudBilling.submitCouponRedemption.useMutation();

  if (mutation.isSuccess) {
    return (
      <Alert variant="info">
        <Alert.Title>Coupon submitted</Alert.Title>
        <Alert.Description>
          {`We received your ${COUPON_PROGRAM_LABELS[mutation.variables.program]} coupon. The credits are applied to your organization and show up on your next invoice.`}
        </Alert.Description>
      </Alert>
    );
  }

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <p className="text-muted-foreground text-sm">
        {`The coupon is submitted together with your email address (${submitterEmail}) and your ClickHouse organization ID (${clickhouseOrganizationId}), so the credits land on this organization.`}
      </p>
      <Form
        onSubmit={form.handleSubmit((values) =>
          mutation.mutate(
            { orgId, ...values },
            {
              onSuccess: () =>
                capture("billing_coupon:submitted", {
                  program: values.program,
                  isPrefilled: Boolean(initialValues.couponCode),
                }),
            },
          ),
        )}
        actions={[
          {
            id: "redeem",
            type: "submit",
            text: "Redeem coupon",
            loading: mutation.isPending,
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
      </Form>
    </div>
  );
}
