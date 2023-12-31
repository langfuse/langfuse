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
import Header from "@/src/components/layouts/header";

import * as z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { api } from "@/src/utils/api";

import { useState } from "react";
import { useSession } from "next-auth/react";

import { PasswordResetSuccess } from "@/src/features/auth/components/PasswordResetSuccess";
import { useRouter } from "next/router";

export default function ChangePassword() {
  const session = useSession();
  const router = useRouter();
  const credentialAuthForm = z.object({
    old_password: z.string(),
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

  const [isPasswordResetSuccess, setIsPasswordResetSuccess] = useState(false);

  // Credentials
  const credentialsForm = useForm<z.infer<typeof credentialAuthForm>>({
    resolver: zodResolver(credentialAuthForm),
    defaultValues: {
      old_password: "",
      new_password: "",
      reenter_new_password: "",
    },
  });

  const utils = api.useUtils();
  const mutPasswordToDBLoggedIn = api.users.resetPasswordLoggedIn.useMutation({
    onSuccess: () => utils.users.invalidate(),
    onError: (error) => console.error(error),
  });
  const mutPasswordToDBLoggedOut = api.users.resetPasswordLoggedOut.useMutation(
    {
      onSuccess: () => utils.users.invalidate(),
      onError: (error) => console.error(error),
    },
  );

  async function onCredentialsSubmit(
    values: z.infer<typeof credentialAuthForm>,
  ) {
    setCredentialsFormError(null);
    if (values.new_password != values.reenter_new_password) {
      setCredentialsFormError("Passwords do not match");
      return;
    }
    try {
      if (session.data?.user != null) {
        const res = await mutPasswordToDBLoggedIn.mutateAsync({
          email: String(session.data.user.email),
          old_password: values.old_password,
          new_password: values.new_password,
        });
        if (!res) {
          setCredentialsFormError(
            "Old Password doesnt match with the existing password",
          );
          return;
        }
      } else {
        const res = await mutPasswordToDBLoggedOut.mutateAsync({
          // @ts-expect-error: Object is possibly 'null'.
          email: router.query.token[1],
          new_password: values.new_password,
        });
        if (!res) {
          setCredentialsFormError(
            "Old Password doesnt match with the existing password",
          );
          return;
        }
      }
      setIsPasswordResetSuccess(true);
    } catch (err) {
      setCredentialsFormError("An error occurred. Please try again.");
    }
  }
  return (
    <div className="md:container">
      <Header title="Change Password" />
      <Form {...credentialsForm}>
        <form
          className="space-y-6"
          // eslint-disable-next-line @typescript-eslint/no-misused-promises
          onSubmit={credentialsForm.handleSubmit(onCredentialsSubmit)}
        >
          {session.data?.user != null ? (
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
          ) : (
            <></>
          )}
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
      {isPasswordResetSuccess && <PasswordResetSuccess />}
    </div>
  );
}
