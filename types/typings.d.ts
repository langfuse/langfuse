interface Product {
  id?: number;
  product: string;
  price: string;
}
// General App types
// i18n: internationalisation
type SimpleDictionary = Record<string, string>;

type Flag = {
  code: string;
  language: string;
};
type ChatGPTAgent = "user" | "system" | "assistant" | "function";

const tiers = {
  free: "free",
  professional: "professional",
  business: "business",
  enterprise: "enterprise",
} as const;
type Tiers = (typeof tiers)[keyof typeof tiers];

const tiers = {
  free: "free",
  professional: "professional",
  business: "business",
  enterprise: "enterprise",
} as const;
type Tiers = (typeof tiers)[keyof typeof tiers];

// Chat
const chatModes = {
  converse: "converse",
  plan: "plan",
  reflect: "reflect",
  structured: "structured",
} as const;
type ChatMode = (typeof chatModes)[keyof typeof chatModes];

const llms = {
  botree: "botree",
  gpt3: "gpt-3",
  gpt4: "gpt-4",
} as const;
type LLM = (typeof llms)[keyof typeof llms];

interface ChatGPTMessage {
  role: ChatGPTAgent;
  content: string;
  sourceDocs?: any;
  followUps?: any;
  feedback?: ResponseUserRating;
  user?: Record<string, any>;
}
type ResponseUserRating =
  | undefined
  | number
  | { user: Record<string, any>; rating: number | undefined }[];
type LineProps = {
  message: ChatGPTMessage;
  lang: Locale;
  gisId: string;
  chatId?: string;
  assistantName: string;
  index: number;
  user: User | null | undefined;
};

type Chat = {
  _id?: ObjectId;
  gisId: string;
  messages: ChatGPTMessage[];
  user: string;
  createdAt: string;
  mode?: string;
  libSource?: string;
};
type HtmlElementMetaDataBase = {
  id?: number | string;
  label: string;
  hover: string;
};
const i18n = {
  de: "de",
  en: "en",
  es: "es",
  it: "it",
} as const;
type Locale = (typeof i18n)[keyof typeof i18n];

const tiers = {
  free: "free",
  professional: "professional",
  business: "business",
  enterprise: "enterprise",
} as const;

type SubscriptionTier = (typeof tiers)[keyof typeof tiers];
const knowledgeVisibility = {
  public: "public",
  paid: "paid",
  private: "private",
} as const;

type KnowledgeVisibility =
  (typeof knowledgeVisibility)[keyof typeof knowledgeVisibility];

const knowledgeCategory = {
  public: "public",
  paid: "paid",
  private: "private",
  shared: "shared",
} as const;

type KnowledgeCategory =
  (typeof knowledgeCategory)[keyof typeof knowledgeCategory];

const roles = {
  user: "user",
  admin: "admin",
  expert: "expert",
  influencer: "influencer",
  publisher: "publisher",
} as const;

type Roles = (typeof roles)[keyof typeof roles];

// "" | "" | "" | "";
// Truth Tables - Knowledge
type LibraryState = {
  id: string;
  value: boolean;
};

type GraphConnection = { id: string; weight: number };
type KnowledgeTag = {
  id: string;
  text: string;
  connections?: GraphConnection[];
  weight?: number;
};
type CollectionMetadata = {
  projectId?: string;
  title: string;
  description: string;
  use?: string;
  visibility: KnowledgeCategory | KnowledgeVisibility;
  owner?: string;
  image?: string;
  tags?: string;
  publishedAt?: string;
  updatedAt?: string;
  // tags: KnowledgeTag[];
};
interface KnowledgeLibrary {
  id: string;
  name: string;
  metadata: Metadata | null;
  documents: FullDocument[];
}
interface FullDocument {
  id: string;
  createdAt?: string;
  publishedAt?: string;
  name?: string;
  author?: string;
  abbreviation?: string;
  usefulFor?: string;
  description?: string;
  title: string;
  // status: TypedColumn;
  image?: Image;
  source: string;
  version?: string;
  feedback?: Feedback;
}

// type User = {
//   uid: string;
//   name: string;
//   email: string;
//   image?: string | undefined | null;
//   tokenBalance: number;
//   roles: Role[];
//   tier: SubscriptionTier;
//   libraries: string[];
// };
type IndividualFeedback = {
  user: JWT | JwtPayload | null;
  rating: Rating[];
};

type Feedback = { general: number; individual: IndividualFeedback[] };
type Doc = { pageContent: string; metadata: Record<string, any> };
type Docs = Doc[];
interface KnowledgeBoard {
  columns: Map<string, KnowledgeLibrary>;
}
// News Types

type NewsSearchParams = {
  term: string;
  languages?: string;
  countries?: string;
  authors?: string;
  sources?: string;
};
type NewsCategory =
  | "general"
  | "business"
  | "technology"
  | "entertainment"
  | "health"
  | "science"
  | "politics";
type HashTag = {
  id: string;
  text: string;
};
type FilterMetadata = {
  authors: string[];
  sources: string[];
  countries: string[];
  languages: string[];
};
type Pagination = {
  count: Int;
  limit: Int;
  offset: Int;
  total: Int;
};
type NewsArticle = {
  id: string;
  author?: string;
  image: string | null;
  category: NewsCategory;
  country: string;
  description: string;
  language: string;
  published_at: string;
  source: string;
  title: string;
  url: string;
};
type NewsResponse = { pagination: Pagination; data: NewsArticle[] };

// Intelligence
// Agents
type Rule = { id: string; name: string; rule: string };

const mbti = {
  ISTJ: "ISTJ",
  ISFJ: "ISFJ",
  INFJ: "INFJ",
  INTJ: "INTJ",
  ISTP: "ISTP",
  ISFP: "ISFP",
  INFP: "INFP",
  INTP: "INTP",
  ESTP: "ESTP",
  ESFP: "ESFP",
  ENFP: "ENFP",
  ENTP: "ENTP",
  ESTJ: "ESTJ",
  ESFJ: "ESFJ",
  ENFJ: "ENFJ",
  ENTJ: "ENTJ",
} as const;

type MBTI = (typeof mbti)[keyof typeof mbti];
type MeyerBriggsType = {
  name: string;
  description: string;
  modelRepresentation: GPTModelParameters;
};
type PersonaType = "expert" | "coach" | "conversational" | "custom";

type Persona = {
  id: string;
  modes: Modes;
  autonomy?: number;
  roles?: string[];
  type: PersonaType;
  name: string;
  disclaimer?: string;
  instructions?: string;
  description: string;
  greeting: string;
  mbti?: MBTI;
  options: {
    upload: boolean;
    reveal: boolean;
    featured: boolean;
    webResource: boolean;
  };
  gptParams?: {
    temperature: number;
    top_p: number;
    frequency_penalty: number;
    presence_penalty: number;
  };
};

interface ShareButtonProps {
  url: string;
  title: string;
  description: string;
  sidebar?: boolean;
}
