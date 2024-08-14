import { type Model } from "@langfuse/shared";
import { type TiktokenModel } from "js-tiktoken";
declare const chatModels: string[];
export type ChatModel = (typeof chatModels)[number];
export declare const isChatModel: (model: string) => model is string;
export declare const isTiktokenModel: (model: string) => model is TiktokenModel;
export declare function tokenCount(p: {
    model: Model;
    text: unknown;
}): number | undefined;
export {};
//# sourceMappingURL=usage.d.ts.map