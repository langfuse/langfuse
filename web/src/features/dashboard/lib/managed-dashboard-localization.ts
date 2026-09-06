type ManagedResource = {
  id: string;
  name: string;
  description?: string;
  owner: string;
};

const MANAGED_DASHBOARD_MESSAGE_KEYS_BY_ID = {
  "langfuse-home-dashboard": "home",
  cmawoi7yd00aqad07f3why08w: "cost",
  cmawk4ywj00jmad072jn7s0ru: "latency",
  cmawln8k700xqad07000k1q8b: "usage",
} as const;

const MANAGED_DASHBOARD_MESSAGE_KEYS_BY_NAME = {
  "Langfuse Home": "home",
  "Langfuse Cost Dashboard": "cost",
  "Langfuse Latency Dashboard": "latency",
  "Langfuse Usage Management": "usage",
} as const;

export function getManagedDashboardMessageKey(resource: ManagedResource) {
  if (resource.owner !== "LANGFUSE") return undefined;

  return (
    MANAGED_DASHBOARD_MESSAGE_KEYS_BY_ID[
      resource.id as keyof typeof MANAGED_DASHBOARD_MESSAGE_KEYS_BY_ID
    ] ??
    MANAGED_DASHBOARD_MESSAGE_KEYS_BY_NAME[
      resource.name as keyof typeof MANAGED_DASHBOARD_MESSAGE_KEYS_BY_NAME
    ]
  );
}

const MANAGED_WIDGET_MESSAGE_KEYS_BY_ID = {
  cmawk617300iiad07zaes6h3l: "cmawk617300iiad07zaes6h3l",
  cmawk6isp00kbad07t66dohjn: "cmawk6isp00kbad07t66dohjn",
  cma2f2ioc001had07f7810kg1: "cma2f2ioc001had07f7810kg1",
  cmawk9xbu00lfad07s9j1bxnx: "cmawk9xbu00lfad07s9j1bxnx",
  cmawkfg0m00kzad07jyofrnq2: "cmawkfg0m00kzad07jyofrnq2",
  cmawk6nqs00jwad07hwpsj3z2: "cmawk6nqs00jwad07hwpsj3z2",
  cmawk7btd00khad07g625cqmp: "cmawk7btd00khad07g625cqmp",
  cmawk94z800ldad07jjox8ugd: "cmawk94z800ldad07jjox8ugd",
  cmawka1fk00kdad07vdipgz04: "cmawka1fk00kdad07vdipgz04",
  cmawksk8h00phad07s9c7v6d7: "cmawksk8h00phad07s9c7v6d7",
  cmawktot400pkad07m8gy30vq: "cmawktot400pkad07m8gy30vq",
  cmawl83ks001ead076pk2wcex: "cmawl83ks001ead076pk2wcex",
  cmawle4zj0096ad0650rzeh0z: "cmawle4zj0096ad0650rzeh0z",
  cmawljmu100v7ad07pd3apnwe: "cmawljmu100v7ad07pd3apnwe",
  cmawlkgt300vsad06g69vqqej: "cmawlkgt300vsad06g69vqqej",
  cmawloc0k010uad06e4git5kz: "cmawloc0k010uad06e4git5kz",
  cmawlaqoa004kad07e2q0za6k: "cmawlaqoa004kad07e2q0za6k",
  cmawlbdu2004nad07lks0j8lw: "cmawlbdu2004nad07lks0j8lw",
  cmawk5sik00igad07kjetg17j: "cmawk5sik00igad07kjetg17j",
  cmawlotp500zcad076b8u704s: "cmawlotp500zcad076b8u704s",
  cmawlpv4600y0ad0770qyrix9: "cmawlpv4600y0ad0770qyrix9",
  cmawlqkxk00xfad07r8zoc4ag: "cmawlqkxk00xfad07r8zoc4ag",
  cmawlrhom00xhad07phtqc81k: "cmawlrhom00xhad07phtqc81k",
  cmawlt6wi00zmad07cvxeeepq: "cmawlt6wi00zmad07cvxeeepq",
  cmawltpsx00yaad07f51yvkwg: "cmawltpsx00yaad07f51yvkwg",
  cmawlu5bs00zsad07maibk7ef: "cmawlu5bs00zsad07maibk7ef",
  cmawlw4s700zvad07qq4qi0gp: "cmawlw4s700zvad07qq4qi0gp",
  cmawlxdo00106ad07crpey1if: "cmawlxdo00106ad07crpey1if",
} as const;

const MANAGED_WIDGET_MESSAGE_KEYS_BY_NAME = {
  "P 95 Latency by Use Case": "cmawk617300iiad07zaes6h3l",
  "P 95 Latency by Level (Observations)": "cmawk6isp00kbad07t66dohjn",
  "Total costs": "cma2f2ioc001had07f7810kg1",
  "Top 20 Users by Cost": "cmawk9xbu00lfad07s9j1bxnx",
  "Top 20 Use Cases (Observation) by Cost": "cmawkfg0m00kzad07jyofrnq2",
  "Top 20 Use Cases (Trace) by Cost": "cmawk6nqs00jwad07hwpsj3z2",
  "Cost by Environment": "cmawk7btd00khad07g625cqmp",
  "Max Latency by User Id (Traces)": "cmawk94z800ldad07jjox8ugd",
  "Avg Time To First Token by Prompt Name (Observations)":
    "cmawka1fk00kdad07vdipgz04",
  "P 95 Time To First Token by Model": "cmawksk8h00phad07s9c7v6d7",
  "P 95 Latency by Model": "cmawktot400pkad07m8gy30vq",
  "Avg Output Tokens Per Second by Model": "cmawl83ks001ead076pk2wcex",
  "P 95 Cost per Trace": "cmawle4zj0096ad0650rzeh0z",
  "P 95 Output Cost per Observation": "cmawljmu100v7ad07pd3apnwe",
  "P 95 Input Cost per Observation": "cmawlkgt300vsad06g69vqqej",
  "Total Trace Count": "cmawloc0k010uad06e4git5kz",
  "Total Count Traces": "cmawlaqoa004kad07e2q0za6k",
  "Total Count Observations": "cmawlbdu2004nad07lks0j8lw",
  "Cost by Model Name": "cmawk5sik00igad07kjetg17j",
  "Total Observation Count": "cmawlotp500zcad076b8u704s",
  "Total Trace Count (over time)": "cmawlrhom00xhad07phtqc81k",
  "Total Observation Count (over time)": "cmawlt6wi00zmad07cvxeeepq",
  "Total Trace Count (by env)": "cmawlw4s700zvad07qq4qi0gp",
  "Total Observation Count (by env)": "cmawlxdo00106ad07crpey1if",
} as const;

const MANAGED_WIDGET_MESSAGE_KEYS_BY_NAME_AND_DESCRIPTION = {
  "Total Score Count (numeric)::Total count of numeric scores across all environments":
    "cmawlpv4600y0ad0770qyrix9",
  "Total Score Count (categorical)::Total count of categorical scores across all environments":
    "cmawlqkxk00xfad07r8zoc4ag",
  "Total Score Count (numeric)::Trend of numeric score count over time":
    "cmawltpsx00yaad07f51yvkwg",
  "Total Score Count (categorical)::Trend of categorical score count over time":
    "cmawlu5bs00zsad07maibk7ef",
} as const;

export function getManagedWidgetMessageKey(resource: ManagedResource) {
  if (resource.owner !== "LANGFUSE") return undefined;

  return (
    MANAGED_WIDGET_MESSAGE_KEYS_BY_ID[
      resource.id as keyof typeof MANAGED_WIDGET_MESSAGE_KEYS_BY_ID
    ] ??
    MANAGED_WIDGET_MESSAGE_KEYS_BY_NAME_AND_DESCRIPTION[
      `${resource.name}::${resource.description ?? ""}` as keyof typeof MANAGED_WIDGET_MESSAGE_KEYS_BY_NAME_AND_DESCRIPTION
    ] ??
    MANAGED_WIDGET_MESSAGE_KEYS_BY_NAME[
      resource.name as keyof typeof MANAGED_WIDGET_MESSAGE_KEYS_BY_NAME
    ]
  );
}
