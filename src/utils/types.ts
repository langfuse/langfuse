import { type Observation } from "@prisma/client";
import { type inferRouterInputs, type inferRouterOutputs } from "@trpc/server";
import { type AppRouter } from "@/src/server/api/root";

export type NestedObservation = Observation & {
  children: NestedObservation[];
};

export type TypedObservation = Event | Span | Generation;

export type Event = Observation & {
  type: "EVENT";
};

export type Span = Observation & {
  type: "SPAN";
  endTime: Date; // not null
};

export type LLMChatMessages = { role: string; content: string };

export type GenerationUsage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

export type Generation = Observation & {
  type: "GENERATION";
  usage: GenerationUsage;
  modelParameters: {
    [key: string]: string | number | boolean;
  };
};


// model Neurons {
//   id          String   @id @default(cuid())
//   owner       User     @relation(fields: [ownerId], references: [id])
//   ownerId     String
//   timestamp   DateTime @default(now()) @map("timestamp")
//   createdAt   DateTime @default(now()) @map("created_at")
//   updatedAt   DateTime @updatedAt @map("updated_at")
//   wallets     Wallet[]
//   rank        Int
//   stake       Int
//   emission    Int
//   incentive   Int
//   consensus   Int
//   trust       Int

//   @@map("neurons")
// }


export type Neuron = {
  id: string;
  ownerId: string;
  projectId: string;
  timestamp: Date;
  createdAt: Date;
  updatedAt: Date;
  rank: number | undefined;
  stake: number | undefined;
  emission: number | undefined;
  incentive: number | undefined;
  consensus: number | undefined;
  trust: number | undefined;
};

  

export type RouterInput = inferRouterInputs<AppRouter>;
export type RouterOutput = inferRouterOutputs<AppRouter>;
