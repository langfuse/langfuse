import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";

import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Form } from "@/src/components/design-system/Form/Form";

import { CouponCodeSchema } from "../utils/coupons";
import { useCouponRedemption } from "./useCouponRedemption";

const couponFormSchema = z.object({
  couponCode: CouponCodeSchema,
  firstName: z.string().trim().min(1, "Enter your first name").max(100),
  lastName: z.string().trim().min(1, "Enter your last name").max(100),
});

type CouponFormInput = z.input<typeof couponFormSchema>;
type CouponFormOutput = z.output<typeof couponFormSchema>;

export type CouponRedemptionFormProps = {
  orgId: string;
  orgName: string;
  submitterEmail: string;
  /** Prefilled from the account name. */
  initialName: { firstName: string; lastName: string };
};

export function CouponRedemptionForm({
  orgId,
  orgName,
  submitterEmail,
  initialName,
}: CouponRedemptionFormProps) {
  const form = useForm<CouponFormInput, undefined, CouponFormOutput>({
    resolver: zodResolver(couponFormSchema),
    defaultValues: { couponCode: "", ...initialName },
  });
  const redemption = useCouponRedemption({
    orgId,
    onInvalidCode: () =>
      form.setError(
        "couponCode",
        { message: "This coupon code is not valid." },
        { shouldFocus: true },
      ),
  });

  if (redemption.isSubmitted) {
    return (
      <Alert variant="info">
        <Alert.Title>Coupon submitted</Alert.Title>
        <Alert.Description>
          {`We received your coupon for ${orgName}. We'll email you at ${submitterEmail} once it has been reviewed.`}
        </Alert.Description>
      </Alert>
    );
  }

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <div className="flex flex-col gap-3 text-sm">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <dt className="text-muted-foreground">Organization</dt>
          <dd className="font-medium">{orgName}</dd>
          <dt className="text-muted-foreground">Organization ID</dt>
          <dd>{orgId}</dd>
        </dl>
        <p className="text-muted-foreground">
          {`Credits are applied to this organization. To redeem the coupon for a different one, switch organizations in the top left corner. We'll email you at ${submitterEmail} once your coupon has been reviewed.`}
        </p>
      </div>
      <Form
        onSubmit={form.handleSubmit(redemption.redeem)}
        actions={[
          {
            id: "redeem",
            type: "submit",
            text: "Redeem coupon",
            loading: redemption.isPending,
          },
        ]}
      >
        <Form.InputField
          control={form.control}
          name="couponCode"
          label="Coupon code"
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
