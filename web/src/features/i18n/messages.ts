import type { AppLocale } from "@/src/features/i18n/config";
import englishMessages from "@/src/features/i18n/messages/en.json";
import simplifiedChineseMessages from "@/src/features/i18n/messages/zh-CN.json";
import englishAuthMessages from "@/src/features/i18n/messages/en/auth.json";
import simplifiedChineseAuthMessages from "@/src/features/i18n/messages/zh-CN/auth.json";
import englishAccountSettingsMessages from "@/src/features/i18n/messages/en/accountSettings.json";
import simplifiedChineseAccountSettingsMessages from "@/src/features/i18n/messages/zh-CN/accountSettings.json";
import englishWorkspaceMessages from "@/src/features/i18n/messages/en/workspace.json";
import simplifiedChineseWorkspaceMessages from "@/src/features/i18n/messages/zh-CN/workspace.json";
import englishProductTableMessages from "@/src/features/i18n/messages/en/productTables.json";
import simplifiedChineseProductTableMessages from "@/src/features/i18n/messages/zh-CN/productTables.json";
import englishSharedUiMessages from "@/src/features/i18n/messages/en/sharedUi.json";
import simplifiedChineseSharedUiMessages from "@/src/features/i18n/messages/zh-CN/sharedUi.json";
import englishCoreObservabilityMessages from "@/src/features/i18n/messages/en/coreObservability.json";
import simplifiedChineseCoreObservabilityMessages from "@/src/features/i18n/messages/zh-CN/coreObservability.json";
import englishAccessSettingsMessages from "@/src/features/i18n/messages/en/accessSettings.json";
import simplifiedChineseAccessSettingsMessages from "@/src/features/i18n/messages/zh-CN/accessSettings.json";
import englishAuxSettingsMessages from "@/src/features/i18n/messages/en/auxSettings.json";
import simplifiedChineseAuxSettingsMessages from "@/src/features/i18n/messages/zh-CN/auxSettings.json";
import englishSessionMessages from "@/src/features/i18n/messages/en/sessions.json";
import simplifiedChineseSessionMessages from "@/src/features/i18n/messages/zh-CN/sessions.json";
import englishCommonActionMessages from "@/src/features/i18n/messages/en/commonActions.json";
import simplifiedChineseCommonActionMessages from "@/src/features/i18n/messages/zh-CN/commonActions.json";
import englishLlmConnectionMessages from "@/src/features/i18n/messages/en/llmConnections.json";
import simplifiedChineseLlmConnectionMessages from "@/src/features/i18n/messages/zh-CN/llmConnections.json";
import englishPlaygroundDashboardMessages from "@/src/features/i18n/messages/en/playgroundDashboard.json";
import simplifiedChinesePlaygroundDashboardMessages from "@/src/features/i18n/messages/zh-CN/playgroundDashboard.json";
import englishIntegrationSettingsMessages from "@/src/features/i18n/messages/en/integrationsSettings.json";
import simplifiedChineseIntegrationSettingsMessages from "@/src/features/i18n/messages/zh-CN/integrationsSettings.json";
import englishCoreDetailsMessages from "@/src/features/i18n/messages/en/coreDetails.json";
import simplifiedChineseCoreDetailsMessages from "@/src/features/i18n/messages/zh-CN/coreDetails.json";
import englishSettingsEnterpriseMessages from "@/src/features/i18n/messages/en/settingsEnterprise.json";
import simplifiedChineseSettingsEnterpriseMessages from "@/src/features/i18n/messages/zh-CN/settingsEnterprise.json";
import englishEvaluationAnalyticsMessages from "@/src/features/i18n/messages/en/evaluationAnalytics.json";
import simplifiedChineseEvaluationAnalyticsMessages from "@/src/features/i18n/messages/zh-CN/evaluationAnalytics.json";
import englishRemainderUiMessages from "@/src/features/i18n/messages/en/remainderUi.json";
import simplifiedChineseRemainderUiMessages from "@/src/features/i18n/messages/zh-CN/remainderUi.json";
import englishSystemUiMessages from "@/src/features/i18n/messages/en/systemUi.json";
import simplifiedChineseSystemUiMessages from "@/src/features/i18n/messages/zh-CN/systemUi.json";
import englishOperationsUiMessages from "@/src/features/i18n/messages/en/operationsUi.json";
import simplifiedChineseOperationsUiMessages from "@/src/features/i18n/messages/zh-CN/operationsUi.json";

const englishAppMessages = {
  ...englishMessages,
  auth: englishAuthMessages,
  accountSettings: englishAccountSettingsMessages,
  workspace: englishWorkspaceMessages,
  productTables: englishProductTableMessages,
  sharedUi: englishSharedUiMessages,
  coreObservability: englishCoreObservabilityMessages,
  accessSettings: englishAccessSettingsMessages,
  auxSettings: englishAuxSettingsMessages,
  sessions: englishSessionMessages,
  commonActions: englishCommonActionMessages,
  llmConnections: englishLlmConnectionMessages,
  playgroundDashboard: englishPlaygroundDashboardMessages,
  integrationsSettings: englishIntegrationSettingsMessages,
  coreDetails: englishCoreDetailsMessages,
  settingsEnterprise: englishSettingsEnterpriseMessages,
  evaluationAnalytics: englishEvaluationAnalyticsMessages,
  remainderUi: englishRemainderUiMessages,
  systemUi: englishSystemUiMessages,
  operationsUi: englishOperationsUiMessages,
};

export type AppMessages = typeof englishAppMessages;
export type NavigationItemMessageKey = keyof AppMessages["navigation"]["items"];

const messagesByLocale = {
  en: englishAppMessages,
  "zh-CN": {
    ...simplifiedChineseMessages,
    auth: simplifiedChineseAuthMessages,
    accountSettings: simplifiedChineseAccountSettingsMessages,
    workspace: simplifiedChineseWorkspaceMessages,
    productTables: simplifiedChineseProductTableMessages,
    sharedUi: simplifiedChineseSharedUiMessages,
    coreObservability: simplifiedChineseCoreObservabilityMessages,
    accessSettings: simplifiedChineseAccessSettingsMessages,
    auxSettings: simplifiedChineseAuxSettingsMessages,
    sessions: simplifiedChineseSessionMessages,
    commonActions: simplifiedChineseCommonActionMessages,
    llmConnections: simplifiedChineseLlmConnectionMessages,
    playgroundDashboard: simplifiedChinesePlaygroundDashboardMessages,
    integrationsSettings: simplifiedChineseIntegrationSettingsMessages,
    coreDetails: simplifiedChineseCoreDetailsMessages,
    settingsEnterprise: simplifiedChineseSettingsEnterpriseMessages,
    evaluationAnalytics: simplifiedChineseEvaluationAnalyticsMessages,
    remainderUi: simplifiedChineseRemainderUiMessages,
    systemUi: simplifiedChineseSystemUiMessages,
    operationsUi: simplifiedChineseOperationsUiMessages,
  },
} satisfies Record<AppLocale, AppMessages>;

export function getMessages(locale: AppLocale): AppMessages {
  return messagesByLocale[locale];
}
