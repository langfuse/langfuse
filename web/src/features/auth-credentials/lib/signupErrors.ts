import { ENTERPRISE_SSO_REQUIRED_MESSAGE } from "@/src/features/auth/constants";

export const SIGNUP_ERRORS = {
  SIGNUP_DISABLED: "Sign up is disabled.",
  PASSWORD_SIGNUP_DISABLED:
    "Sign up with email and password is disabled for this instance. Please use SSO.",
  DOMAIN_SSO_REQUIRED:
    "Sign up with email and password is disabled for this domain. Please use SSO.",
  ENTERPRISE_SSO_REQUIRED: ENTERPRISE_SSO_REQUIRED_MESSAGE,
  ACCOUNT_EXISTS: "User with email already exists. Please sign in.",
  IDENTITY_PROVIDER_ACCOUNT_EXISTS:
    "You have already signed up via an identity provider. Please sign in.",
  EMAIL_VERIFICATION_REQUIRED:
    "Direct signup is disabled. Please use the email verification flow.",
} as const;

export type SignupErrorCode = keyof typeof SIGNUP_ERRORS;

export type SignupError = {
  code: SignupErrorCode;
  message: (typeof SIGNUP_ERRORS)[SignupErrorCode];
};

export function getSignupError(code: SignupErrorCode): SignupError {
  return { code, message: SIGNUP_ERRORS[code] };
}

export function getSignupErrorForMessage(message: string): SignupError | null {
  const entry = Object.entries(SIGNUP_ERRORS).find(
    ([, errorMessage]) => errorMessage === message,
  );

  return entry ? getSignupError(entry[0] as SignupErrorCode) : null;
}

export function isSignupErrorCode(value: unknown): value is SignupErrorCode {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(SIGNUP_ERRORS, value)
  );
}
