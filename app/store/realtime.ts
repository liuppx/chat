import { ServiceProvider } from "../constant";

export const REALTIME_ROUTER_PROVIDER = "Router" as const;
export const DEFAULT_OPENAI_REALTIME_MODEL =
  "gpt-4o-realtime-preview-2024-10-01";
export const DEFAULT_ROUTER_REALTIME_MODEL = "qwen3.5-omni-plus-realtime";
export const DEFAULT_OPENAI_REALTIME_VOICE = "alloy";
export const DEFAULT_ROUTER_REALTIME_VOICE = "Tina";

export type RealtimeProvider =
  | ServiceProvider.OpenAI
  | ServiceProvider.Azure
  | typeof REALTIME_ROUTER_PROVIDER;

export type RealtimeConfig = {
  enabled: boolean;
  provider: RealtimeProvider;
  model: string;
  apiKey: string;
  router: {
    endpoint: string;
  };
  azure: {
    endpoint: string;
    deployment: string;
  };
  temperature: number;
  voice: string;
};

export type LegacyRealtimeConfig = Partial<RealtimeConfig> & {
  enable?: boolean;
};

export function createDefaultRealtimeConfig(
  override?: LegacyRealtimeConfig,
): RealtimeConfig {
  const { enable, azure, ...rest } = override ?? {};
  const defaultConfig: RealtimeConfig = {
    enabled: false,
    provider: ServiceProvider.OpenAI,
    model: DEFAULT_OPENAI_REALTIME_MODEL,
    apiKey: "",
    router: {
      endpoint: "",
    },
    azure: {
      endpoint: "",
      deployment: "",
    },
    temperature: 0.9,
    voice: DEFAULT_OPENAI_REALTIME_VOICE,
  };

  return {
    ...defaultConfig,
    ...rest,
    enabled: rest.enabled ?? enable ?? false,
    router: {
      endpoint: rest.router?.endpoint ?? "",
    },
    azure: {
      endpoint: azure?.endpoint ?? "",
      deployment: azure?.deployment ?? "",
    },
  };
}

export function isRouterRealtimeProvider(
  provider?: RealtimeProvider | string,
): provider is typeof REALTIME_ROUTER_PROVIDER {
  return provider === REALTIME_ROUTER_PROVIDER;
}
