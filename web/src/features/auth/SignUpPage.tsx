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
import { signupSchema } from "@/src/features/auth/lib/signupSchema";
import { zodResolver } from "@hookform/resolvers/zod";
import { signIn } from "next-auth/react";
import Head from "next/head";
import Link from "next/link";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { env } from "@/src/env.mjs";
import { useState } from "react";
import { LangfuseIcon } from "@/src/components/design-system/LangfuseIcon/LangfuseIcon";
import { CloudPrivacyNotice } from "@/src/features/auth/components/AuthCloudPrivacyNotice";
import { CloudRegionSwitch } from "@/src/features/auth/components/AuthCloudRegionSwitch";
import {
  FALLBACK_AUTH_PROVIDERS,
  SSOButtons,
  useHuggingFaceRedirect,
  type PageProps,
} from "@/src/features/auth/SignInPage";
import { PasswordInput } from "@/src/components/design-system/PasswordInput/PasswordInput";
import { useLangfuseCloudRegion } from "@/src/features/organizations/hooks";
import { useRouter } from "next/router";
import { getSafeRedirectPath } from "@/src/utils/redirect";
import { reportError } from "@/src/utils/reportError";
import { isJsonParseSyntaxError } from "@/src/features/auth/lib/expectedAuthErrors";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import useLocalStorage from "@/src/components/useLocalStorage";
import { noUrlCheck, StringNoHTMLNonEmpty } from "@langfuse/shared";
import { PASSWORD_SETUP_EMAIL_STORAGE_KEY } from "@/src/features/auth-credentials/lib/credentialsUtils";

