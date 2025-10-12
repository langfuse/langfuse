const translation = {
  titles: {
    signIn: "Sign in | Langfuse",
    signUp: "Sign up | Langfuse",
    signInToAccount: "Sign in to your account",
    createNewAccount: "Create new account",
  },
  form: {
    forgotPassword: "(forgot password?)",
  },
  links: {
    noAccountYet: "No account yet?",
    contactUs: "(contact us)",
  },
  buttons: {
    signIn: "Sign in",
    signUp: "Sign up",
    signOut: "Sign out",
    githubEnterprise: "GitHub Enterprise",
    workosOrganization: "WorkOS (organization)",
    workosConnection: "WorkOS (connection)",
  },
  errors: {
    oauthAccountNotLinked: "Please sign in with the same provider (e.g. Google, GitHub, Azure AD, etc.) that you used to create this account.",
    invalidEmailAddress: "Invalid email address",
    unableToCheckSso: "Unable to check SSO configuration. Please try again.",
    unexpectedError: "An unexpected error occurred.",
    contactSupportUnexpected: "Contact support if this error is unexpected.",
    makeSureCorrectCloudRegion: "Make sure you are using the correct cloud data region.",
    authenticationError: "Authentication Error",
    authenticationErrorOccurred: "An authentication error occurred. Please reach out to support.",
  },
  validation: {
    passwordsDoNotMatch: "Passwords do not match",
  },
  hints: {
    forceRefreshPage: "If you are experiencing issues signing in, please force refresh this page (CMD + SHIFT + R) or clear your browser cache. We are working on a solution.",
    noCreditCardRequired: "No credit card required.",
    whatIsThis: "What is this?",
  },
  dataRegion: {
    label: "Data Region",
    whatIsThis: "(what is this?)",
    title: "Data Regions",
    description: "Langfuse Cloud is available in two data regions:",
    usRegion: "US: Oregon (AWS us-west-2)",
    euRegion: "EU: Ireland (AWS eu-west-1)",
    regionsInfo:
      "Regions are strictly separated, and no data is shared across regions. Choosing a region close to you can help improve speed and comply with local data residency laws and privacy regulations. Contact us to onboard into a HIPAA compliant region.",
    accountsInfo: "You can have accounts in both regions and data migrations are available on Team plans.",
    moreInfo: "For more information, visit",
    securityLink: "langfuse.com/security",
    demoProjectNote: "Demo project is only available in the EU region.",
  },
  privacy: {
    bySigningIn: "By signing in you are agreeing to our",
    byCreatingAccount: "By creating an account you are agreeing to our",
    termsAndConditions: "Terms and Conditions",
    privacyPolicy: "Privacy Policy",
    cookiePolicy: "Cookie Policy",
    dataAccuracy: "You also confirm that the entered data is accurate.",
    comma: ",",
    and: "and",
  },
  dividers: {
    orSignInWith: "or {action} with",
  },
  prompts: {
    enterOrganizationId: "Please enter your organization ID",
    enterConnectionId: "Please enter your connection ID",
  },
  descriptions: {
    createAccountNoCreditCard: "Create an account, no credit card required.",
    passwordResetNotConfigured: "Password reset is not configured on this instance",
    passwordSuccessfullyUpdated: "Password successfully updated. Redirecting ...",
    resetPasswordEmailInfo:
      "You will only receive an email if an account with this email exists and you have signed up with email and password. If you used an authentication provider like Google, GitLab, Okta, or GitHub, please sign in.",
  },
  resetPassword: {
    title: "Reset your password",
    newPassword: "New Password",
    confirmNewPassword: "Confirm New Password",
    updatePassword: "Update Password",
    backToSignIn: "Back to sign in",
    notAvailable: "Not available",
    setupInstructions: "Setup instructions",
    passwordsDoNotMatch: "Passwords do not match",
  },
};

export default translation;
