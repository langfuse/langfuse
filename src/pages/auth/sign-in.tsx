import { type GetServerSideProps } from "next";
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
import { Separator } from "@/src/components/ui/separator";
import { env } from "@/src/env.mjs";
import { zodResolver } from "@hookform/resolvers/zod";
import { FcGoogle } from "react-icons/fc";
import { FaGithub } from "react-icons/fa";
import { signIn } from "next-auth/react";
import Head from "next/head";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";

const formSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, {
    message: "Password must be at least 8 characters long",
  }),
});

type PageProps = {
  authProviders: {
    google: boolean;
    github: boolean;
  };
};

// eslint-disable-next-line @typescript-eslint/require-await
export const getServerSideProps: GetServerSideProps<PageProps> = async () => {
  return {
    props: {
      authProviders: {
        google:
          env.AUTH_GOOGLE_CLIENT_ID !== undefined &&
          env.AUTH_GOOGLE_CLIENT_SECRET !== undefined,
        github:
          env.AUTH_GITHUB_CLIENT_ID !== undefined &&
          env.AUTH_GITHUB_CLIENT_SECRET !== undefined,
      },
    },
  };
};

export default function SignIn(props: PageProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setFormError(null);
    const result = await signIn("credentials", {
      email: values.email,
      password: values.password,
      callbackUrl: "/",
      redirect: false,
    });
    if (result?.error) {
      setFormError(result.error);
    }
  }

  return (
    <>
      <Head>
        <title>Sign in | Langfuse</title>
      </Head>
      <div className="flex flex-1 flex-col py-6 sm:min-h-full sm:justify-center sm:px-6 sm:py-12 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <LangfuseIcon className="mx-auto" />
          <h2 className="mt-4 text-center text-2xl font-bold leading-9 tracking-tight text-gray-900">
            Sign in to your account
          </h2>
        </div>

        <div className="mt-14 sm:mx-auto sm:w-full sm:max-w-[480px]">
          <div className="bg-white px-6 py-12 shadow sm:rounded-lg sm:px-12">
            <Form {...form}>
              <form
                className="space-y-6"
                // eslint-disable-next-line @typescript-eslint/no-misused-promises
                onSubmit={form.handleSubmit(onSubmit)}
              >
                <FormField
                  control={form.control}
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
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
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
                  loading={form.formState.isSubmitting}
                >
                  Sign in
                </Button>
                {formError ? (
                  <div className="text-center text-sm font-medium text-destructive">
                    {formError}, contact support if this error is unexpected.
                  </div>
                ) : null}
              </form>
            </Form>

            {
              // any authprovider from props is enanbles
              Object.values(props.authProviders).some((enabled) => enabled) ? (
                <>
                  <Separator className="mt-6" />

                  <div className="mt-6 flex flex-row flex-wrap items-center justify-center gap-4">
                    {props.authProviders.google ? (
                      <Button
                        onClick={() => void signIn("google")}
                        variant="secondary"
                      >
                        <FcGoogle className="mr-3" size={18} />
                        Sign in with Google
                      </Button>
                    ) : null}
                    {props.authProviders.github ? (
                      <Button
                        onClick={() => void signIn("github")}
                        variant="secondary"
                      >
                        <FaGithub className="mr-3" size={18} />
                        Sign in with Github
                      </Button>
                    ) : null}
                  </div>
                </>
              ) : null
            }
          </div>

          {env.NEXT_PUBLIC_SIGN_UP_DISABLED !== "true" ? (
            <p className="mt-10 text-center text-sm text-gray-500">
              No account yet?{" "}
              <Link
                href="/auth/sign-up"
                className="font-semibold leading-6 text-indigo-600 hover:text-indigo-500"
              >
                Sign up
              </Link>
            </p>
          ) : null}
        </div>
      </div>
    </>
  );
}
