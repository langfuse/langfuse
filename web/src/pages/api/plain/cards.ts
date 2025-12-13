import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod";
import { logger } from "@langfuse/shared/src/server";
import { env } from "@/src/env.mjs";

/* 
This API route is used by Langfuse Cloud to render Cards in Plain.com for more efficient customer support.
This API route is not available in self-hosted deployments.
*/

/*
Example request body:
{
  "cardKeys": [
    "test"
  ],
  "customer": {
    "id": "c_01JRJH726J9AFRBP5MQ5VTVAXH",
    "externalId": null,
    "email": "demo@langfuse.com"
  },
  "tenant": {
    "id": "te_01JVWYPQJ69AHE35R97NRAYM6H",
    "externalId": "cloud_DEV_org_seed-org-id"
  },
  "thread": {
    "id": "th_01JVX0PDD7YXYHG66EWYFB2PAE",
    "externalId": null
  },
  "timestamp": "2025-05-23T13:09:39.820Z"
}
*/

/*
Example response:
{
  "cards": [
    {
      "key": "plan-details", // for every key in the request body, we will return a card with the key
      "timeToLiveSeconds": 86400,
      "components": [
        {
          "componentRow": {
            "rowMainContent": [
              {
                "componentText": {
                  "text": "Plan",
                  "textColor": "MUTED",
                  "textSize": "M"
                }
              }
            ],
            "rowAsideContent": [
              {
                "componentBadge": {
                  "badgeLabel": "Starter",
                  "badgeColor": "YELLOW"
                }
              }
            ]
          }
        }
      ]
    }
  ]
}
*/

/*
Example response for card that is empty:
{
  "cards": [
    {
      "key": "plan-details",
      "components": null
    }
  ]
}
*/

const RequestSchema = z.object({
  cardKeys: z.array(z.string()),
  customer: z.object({
    id: z.string(),
    externalId: z.string().nullable(),
    email: z.string(),
  }),
  tenant: z.object({
    id: z.string(),
    externalId: z.string().nullable(),
  }),
  thread: z.object({
    id: z.string(),
    externalId: z.string().nullable(),
  }),
  timestamp: z.coerce.date(),
});

type CardResponse = {
  key: string;
  timeToLiveSeconds: number;
  components: any[];
};

type ApiResponse = {
  cards: CardResponse[];
};

const getCard = async (
  cardKey: string,
  reqBody: z.infer<typeof RequestSchema>,
): Promise<CardResponse> => {
  return {
    key: cardKey,
    timeToLiveSeconds: 10,
    components: [
      {
        componentText: {
          text: "Request",
          textSize: "S",
          textColor: "MUTED",
        },
      },
      {
        componentText: {
          text: JSON.stringify(reqBody, null, 2),
        },
      },
      {
        componentSpacer: {
          spacerSize: "M",
        },
      },
      {
        componentText: {
          text: "NEXT_PUBLIC_LANGFUSE_CLOUD_REGION",
          textSize: "S",
          textColor: "MUTED",
        },
      },
      {
        componentText: {
          text: env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION ?? "Not set",
        },
      },
    ],
  };
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    // allow only POST requests
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method Not Allowed" });
      return;
    }
    if (!env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) {
      res.status(403).json({ error: "Not allowed" });
      return;
    }
    if (!env.PLAIN_CARDS_API_TOKEN) {
      logger.error("PLAIN_CARDS_API_TOKEN is not set");
      res.status(403).json({ error: "Not allowed" });
      return;
    }

    // verify req authorization
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const [type, token] = authHeader.split(" ");
    if (type !== "Bearer" || token !== env.PLAIN_CARDS_API_TOKEN) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const reqBody = RequestSchema.safeParse(req.body);
    if (!reqBody.success) {
      res.status(400).json({ error: reqBody.error });
      return;
    }

    let cardResponse: CardResponse[] = [];

    for (const cardKey of reqBody.data.cardKeys) {
      const card = await getCard(cardKey, reqBody.data);
      cardResponse.push(card);
    }

    const response: ApiResponse = {
      cards: cardResponse,
    };

    res.status(200).json(response);
  } catch (e) {
    logger.error("failed to get plain.com cards", e);
    res.status(500).json({ error: e });
  }
}
