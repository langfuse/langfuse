import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import { Input } from "@/src/components/ui/input";
import { Button } from "@/src/components/ui/button";
import * as z from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { usePostHog } from "posthog-js/react";
import { signIn } from "next-auth/react";
import { useState } from "react";

export function PasswordForm() {
  const credentialAuthForm = z.object({
    old_password: z.string().min(8, {
      message: "Password must be at least 8 characters long",
    }),
    new_password: z.string().min(8, {
      message: "New Password must be at least 8 characters long",
    }),
    reenter_new_password: z.string().min(8, {
      message: "New Password must be at least 8 characters long",
    }),
  });
  const [credentialsFormError, setCredentialsFormError] = useState<
    string | null
  >(null);

  const posthog = usePostHog();

  // Credentials
  const credentialsForm = useForm<z.infer<typeof credentialAuthForm>>({
    resolver: zodResolver(credentialAuthForm),
    defaultValues: {
      old_password: "",
      new_password: "",
      reenter_new_password: "",
    },
  });
  async function onCredentialsSubmit(
    values: z.infer<typeof credentialAuthForm>,
  ) {
    setCredentialsFormError(null);
    posthog.capture("sign_in:credentials_form_submit");
    const result = await signIn("credentials", {
      old_password: values.old_password,
      new_password: values.new_password,
      reenter_new_password: values.reenter_new_password,
      callbackUrl: "/",
      redirect: false,
    });
    if (result?.error) {
      setCredentialsFormError(result.error);
    }
  }
  return (
    <Form {...credentialsForm}>
      <form
        className="space-y-6"
        onSubmit={credentialsForm.handleSubmit(onCredentialsSubmit)}
      >
        <FormField
          control={credentialsForm.control}
          name="old_password"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm text-gray-500">
                Old Password
              </FormLabel>
              <FormControl>
                <Input type="password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={credentialsForm.control}
          name="new_password"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm text-gray-500">
                New Password
              </FormLabel>
              <FormControl>
                <Input type="password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={credentialsForm.control}
          name="reenter_new_password"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm text-gray-500">
                Re-Enter New Password
              </FormLabel>
              <FormControl>
                <Input type="password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button
          type="submit"
          className="w-full"
          loading={credentialsForm.formState.isSubmitting}
        >
          Change Password
        </Button>
        {credentialsFormError ? (
          <div className="text-center text-sm font-medium text-destructive">
            {credentialsFormError}
            <br />
            Contact support if this error is unexpected.
          </div>
        ) : null}
      </form>
    </Form>
  );
}
