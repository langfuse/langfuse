type PlaygroundModel = {
  /** The raised block's label, shown exactly as written ("GPT 5.2"). */
  name: string;
  /** The model's reply; wrapped into lines under the blocks, keeping any line breaks. */
  output: string;
};

export type PlaygroundContent = {
  /** The system prompt card, shown as written. */
  system: string;
  /** The user message card, shown as written and wired into every model. */
  user: string;
  /** One or two models, side by side; each run shows the next model's reply. */
  models: PlaygroundModel[];
};

/** Characters per slot before an ellipsis, and how the replies wrap; the frame is sized for these. */
export const PLAYGROUND_LIMITS = {
  message: 43,
  model: 10,
  models: 2,
  lineChars: 50,
  lines: 7,
} as const;

const REPLY =
  "No, you don't need an SDK to run Langfuse locally. To run Langfuse locally on your machine, you now need Git, Docker, and Docker Compose installed. You can use Docker Desktop on Mac and Windows (which includes Docker Compose).\nThe process involves cloning the GitHub repository and starting the services with Docker Compose.";

export const PLAYGROUND_DEFAULTS: PlaygroundContent = {
  system: "You're skilled customer service representative for Langfuse.",
  user: "Do I need SDK to run Langfuse on my machine",
  models: [
    { name: "Opus 4.6", output: REPLY },
    {
      name: "GPT 5.2",
      output:
        "No SDK is needed to self-host Langfuse. Clone the repository, then run docker compose up: it starts the web app, the worker, Postgres, ClickHouse, Redis and MinIO on your machine.",
    },
  ],
};
