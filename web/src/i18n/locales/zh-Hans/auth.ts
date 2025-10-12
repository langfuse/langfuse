const translation = {
  titles: {
    signIn: "登录 | Langfuse",
    signUp: "注册 | Langfuse",
    signInToAccount: "登录您的账户",
    createNewAccount: "创建新账户",
  },
  form: {
    forgotPassword: "（忘记密码？）",
  },
  links: {
    noAccountYet: "还没有账户？",
    contactUs: "（联系我们）",
  },
  buttons: {
    signIn: "登录",
    signUp: "注册",
    signOut: "退出",
    githubEnterprise: "GitHub Enterprise",
    workosOrganization: "WorkOS（组织）",
    workosConnection: "WorkOS（连接）",
  },
  errors: {
    oauthAccountNotLinked: "请使用您创建此账户时使用的相同提供商（例如 Google、GitHub、Azure AD 等）登录。",
    invalidEmailAddress: "无效的邮箱地址",
    unableToCheckSso: "无法检查 SSO 配置。请重试。",
    unexpectedError: "发生意外错误。",
    contactSupportUnexpected: "如果此错误是意外的，请联系支持。",
    makeSureCorrectCloudRegion: "确保您使用的是正确的云数据区域。",
    authenticationError: "身份验证错误",
    authenticationErrorOccurred: "发生身份验证错误。请联系支持。",
  },
  validation: {
    passwordsDoNotMatch: "密码不匹配",
  },
  hints: {
    forceRefreshPage: "如果您在登录时遇到问题，请强制刷新此页面（CMD + SHIFT + R）或清除浏览器缓存。我们正在努力解决。",
    noCreditCardRequired: "无需信用卡。",
    whatIsThis: "这是什么？",
  },
  dataRegion: {
    label: "数据区域",
    whatIsThis: "（这是什么？）",
    title: "数据区域",
    description: "Langfuse Cloud 在两个数据区域可用：",
    usRegion: "美国：俄勒冈州（AWS us-west-2）",
    euRegion: "欧盟：爱尔兰（AWS eu-west-1）",
    regionsInfo: "区域严格分离，数据不会跨区域共享。选择离您较近的区域可以帮助提高速度并符合本地数据驻留法律和隐私法规。联系我们以加入 HIPAA 合规区域。",
    accountsInfo: "您可以在两个区域都有账户，团队计划提供数据迁移服务。",
    moreInfo: "更多信息，请访问",
    securityLink: "langfuse.com/security",
    demoProjectNote: "演示项目仅在欧盟区域可用。",
  },
  privacy: {
    bySigningIn: "通过登录，您同意我们的",
    byCreatingAccount: "通过创建账户，您同意我们的",
    termsAndConditions: "条款和条件",
    privacyPolicy: "隐私政策",
    cookiePolicy: "Cookie 政策",
    dataAccuracy: "您还确认输入的数据是准确的。",
    comma: "，",
    and: "和",
  },
  dividers: {
    orSignInWith: "或{action}使用",
  },
  prompts: {
    enterOrganizationId: "请输入您的组织 ID",
    enterConnectionId: "请输入您的连接 ID",
  },
  descriptions: {
    createAccountNoCreditCard: "创建账户，无需信用卡。",
    passwordResetNotConfigured: "此实例上未配置密码重置",
    passwordSuccessfullyUpdated: "密码已成功更新。正在重定向...",
    resetPasswordEmailInfo: "只有当使用此邮箱的账户存在且您使用邮箱和密码注册时，您才会收到邮件。如果您使用了 Google、GitLab、Okta 或 GitHub 等身份验证提供商，请登录。",
  },
  resetPassword: {
    title: "重置您的密码",
    newPassword: "新密码",
    confirmNewPassword: "确认新密码",
    updatePassword: "更新密码",
    backToSignIn: "返回登录",
    notAvailable: "不可用",
    setupInstructions: "设置说明",
    passwordsDoNotMatch: "密码不匹配",
  },
};

export default translation;
