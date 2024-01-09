import { LangfuseIcon } from "@/src/components/LangfuseLogo";
import { Button } from "@/src/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import { Input } from "@/src/components/ui/input";
import { zodResolver } from "@hookform/resolvers/zod";
import Head from "next/head";
import { useState } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { TokenVerification } from "@/src/features/auth/components/TokenVerification";
import { v4 as uuidv4 } from "uuid";
import { api } from "@/src/utils/api";

const credentialAuthForm = z.object({
  email: z.string().email(),
});
export default function ResetPassword() {
  const [credentialsFormError, setCredentialsFormError] = useState<
    string | null
  >(null);

  const [isFormVisible, setFormVisible] = useState(false);

  // Credentials
  const credentialsForm = useForm<z.infer<typeof credentialAuthForm>>({
    resolver: zodResolver(credentialAuthForm),
    defaultValues: {
      email: "",
    },
  });

  const utils = api.useUtils();
  const mutUserTokenToDB = api.users.saveToken.useMutation({
    onSuccess: () => utils.users.invalidate(),
    onError: (error) => console.error(error),
  });
  const mutTokenToEmail = api.users.tokenToEmail.useMutation({
    onSuccess: () => utils.users.invalidate(),
    onError: (error) => console.error(error),
  });
  const mutCheckEmail = api.users.findEmail.useMutation({
    onSuccess: () => utils.users.invalidate(),
    onError: (error) => console.error(error),
  });

  async function onCredentialsSubmit(
    values: z.infer<typeof credentialAuthForm>,
  ) {
    setCredentialsFormError(null);
    const password_reset_token = uuidv4();
    setFormVisible(true);
    try {
      const user = await mutCheckEmail.mutateAsync({
        email: values.email,
      });
      if (user == null) {
        setCredentialsFormError("Email not found. Please try again");
        return;
      }
      await mutUserTokenToDB.mutateAsync({
        email: values.email,
        password_reset_token: password_reset_token,
      });
      await mutTokenToEmail.mutateAsync({
        email: values.email,
        password_reset_token: password_reset_token,
      });
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <>
      <Head>
        <title>Reset Password | Langfuse</title>
      </Head>
      <div className="flex flex-1 flex-col py-6 sm:min-h-full sm:justify-center sm:px-6 sm:py-12 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <LangfuseIcon className="mx-auto" />
          <h2 className="mt-4 text-center text-2xl font-bold leading-9 tracking-tight text-gray-900">
            Reset your Password
          </h2>
        </div>

        <div className="mt-14 bg-white px-6 py-10 shadow sm:mx-auto sm:w-full sm:max-w-[480px] sm:rounded-lg sm:px-12">
          <div className="space-y-8">
            <Form {...credentialsForm}>
              <form
                className="space-y-6"
                // eslint-disable-next-line @typescript-eslint/no-misused-promises
                onSubmit={credentialsForm.handleSubmit(onCredentialsSubmit)}
              >
                <FormField
                  control={credentialsForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input placeholder="jsdoe@example.com" {...field} />
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
                  Sign in
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
          </div>
          {isFormVisible && <TokenVerification />}
        </div>
      </div>
    </>
  );
}
