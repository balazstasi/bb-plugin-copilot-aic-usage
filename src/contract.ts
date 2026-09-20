import {
  defineRpcContract,
  type ExperimentalHostSignals,
} from "@get-bb/plugin-sdk";
import { z } from "zod";
import { targetSchema, usageSchema, threadIdSchema } from "./model";
export * from "./model";
export const hostContract = defineRpcContract({
  read: { input: targetSchema, output: usageSchema },
});
export const changedSchema = targetSchema;
export const hostSignals = {
  changed: { payload: changedSchema },
} satisfies ExperimentalHostSignals;
export const rpcContract = defineRpcContract({
  usage: {
    input: z.object({ threadId: threadIdSchema }).strict(),
    output: usageSchema,
  },
});
