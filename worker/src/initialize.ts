import { upsertDefaultModelPrices } from "./scripts/upsertDefaultModelPrices";
import { upsertManagedEvaluators } from "./scripts/upsertManagedEvaluators";
import { upsertLangfuseDashboards } from "./scripts/upsertLangfuseDashboards";

upsertDefaultModelPrices();
upsertManagedEvaluators();
upsertLangfuseDashboards();
