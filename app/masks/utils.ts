import { Lang } from "../locales";
import { type ModelConfig } from "../store";
import { type ChatMessage } from "../store/chat";
import { type BuiltinMask } from "./typing";

type BuiltinMaskInput = {
  avatar: string;
  name: string;
  description?: string;
  category?: string;
  starters?: string[];
  lang: Lang;
  createdAt: number;
  context: ChatMessage[];
  modelConfig?: Partial<ModelConfig>;
};

const DEFAULT_MODEL_CONFIG: Partial<ModelConfig> = {
  temperature: 0.5,
  max_tokens: 4000,
  presence_penalty: 0,
  frequency_penalty: 0,
  sendMemory: true,
  historyMessageCount: 8,
  compressMessageLengthThreshold: 2000,
};

export function createBuiltinMask(input: BuiltinMaskInput): BuiltinMask {
  return {
    ...input,
    builtin: true,
    hideContext: true,
    syncGlobalConfig: true,
    modelConfig: {
      ...DEFAULT_MODEL_CONFIG,
      ...input.modelConfig,
    },
  };
}
