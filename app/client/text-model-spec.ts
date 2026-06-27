import {
  type LLMConfig,
  type ModelEndpointSpecification,
  type ModelParameterSpecification,
  type ModelSpecification,
} from "./api";
import {
  SupportedTextEndpoint,
  normalizeModelEndpointPath,
  normalizeSupportedEndpoints,
  selectPreferredTextEndpoint,
} from "./endpoints";

export type TextModelParameterKey =
  | "temperature"
  | "top_p"
  | "max_tokens"
  | "presence_penalty"
  | "frequency_penalty";

type TextModelSpecInput = {
  specification?: ModelSpecification;
  endpointPath?: string;
  supportedEndpoints?: readonly string[];
  modelName?: string;
};

const TEXT_ENDPOINTS = [
  SupportedTextEndpoint.Messages,
  SupportedTextEndpoint.Responses,
  SupportedTextEndpoint.ChatCompletions,
] as const;

const PARAMETER_ALIASES: Record<TextModelParameterKey, string[]> = {
  temperature: ["temperature"],
  top_p: ["top_p"],
  max_tokens: ["max_output_tokens", "max_completion_tokens", "max_tokens"],
  presence_penalty: ["presence_penalty"],
  frequency_penalty: ["frequency_penalty"],
};

const ENDPOINT_PARAMETER_ALIASES: Partial<
  Record<string, Partial<Record<TextModelParameterKey, string[]>>>
> = {
  [SupportedTextEndpoint.Responses]: {
    max_tokens: ["max_output_tokens"],
  },
  [SupportedTextEndpoint.ChatCompletions]: {
    max_tokens: ["max_completion_tokens", "max_tokens"],
  },
  [SupportedTextEndpoint.Messages]: {
    max_tokens: ["max_tokens"],
  },
};

function getOrderedTextEndpoints(input: TextModelSpecInput): string[] {
  const normalizedEndpoint = normalizeModelEndpointPath(input.endpointPath);
  const preferredEndpoint =
    normalizedEndpoint && TEXT_ENDPOINTS.includes(normalizedEndpoint as any)
      ? normalizedEndpoint
      : selectPreferredTextEndpoint(input.supportedEndpoints, {
          modelName: input.modelName,
        });
  const supported = normalizeSupportedEndpoints(
    input.supportedEndpoints,
  ).filter((endpoint) => TEXT_ENDPOINTS.includes(endpoint as any));
  const specEndpoints = Object.keys(
    input.specification?.endpoints ?? {},
  ).filter((endpoint) => TEXT_ENDPOINTS.includes(endpoint as any));

  return Array.from(
    new Set(
      [
        preferredEndpoint,
        ...supported,
        ...specEndpoints,
        ...TEXT_ENDPOINTS,
      ].filter(Boolean) as string[],
    ),
  );
}

function getEndpointParameterSpec(
  endpointSpec: ModelEndpointSpecification | undefined,
  key: TextModelParameterKey,
  endpointPath: string,
) {
  const parameters = endpointSpec?.parameters ?? {};
  const endpointAliases = ENDPOINT_PARAMETER_ALIASES[endpointPath]?.[key] ?? [];
  const aliases = [...endpointAliases, ...PARAMETER_ALIASES[key]];
  for (const alias of aliases) {
    const spec = parameters[alias];
    if (spec) return spec;
  }
  return undefined;
}

function getPreferredTextEndpointSpec(input: TextModelSpecInput) {
  const [endpoint] = getOrderedTextEndpoints(input);
  if (!endpoint) return undefined;
  return input.specification?.endpoints?.[endpoint];
}

function normalizeAllowedNumberValues(parameter?: ModelParameterSpecification) {
  if (!Array.isArray(parameter?.allowed_values)) return undefined;
  const values = parameter.allowed_values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  return values.length > 0 ? values : undefined;
}

function clampNumericValue(
  rawValue: number | undefined,
  parameter?: ModelParameterSpecification,
) {
  if (rawValue === undefined || !Number.isFinite(rawValue)) return rawValue;

  let nextValue = rawValue;
  if (typeof parameter?.min === "number" && nextValue < parameter.min) {
    nextValue = parameter.min;
  }
  if (typeof parameter?.max === "number" && nextValue > parameter.max) {
    nextValue = parameter.max;
  }

  const allowedValues = normalizeAllowedNumberValues(parameter);
  if (!allowedValues) return nextValue;
  if (allowedValues.includes(nextValue)) return nextValue;
  return allowedValues.reduce((best, current) =>
    Math.abs(current - nextValue) < Math.abs(best - nextValue) ? current : best,
  );
}

export function getTextModelParameterSpecification(
  input: TextModelSpecInput & { key: TextModelParameterKey },
): ModelParameterSpecification | undefined {
  const endpoints = getOrderedTextEndpoints(input);
  for (const endpointPath of endpoints) {
    const endpointSpec = input.specification?.endpoints?.[endpointPath];
    const parameter = getEndpointParameterSpec(
      endpointSpec,
      input.key,
      endpointPath,
    );
    if (parameter) return parameter;
  }
  return undefined;
}

export function hasExplicitTextParameterCatalog(input: TextModelSpecInput) {
  const endpointSpec = getPreferredTextEndpointSpec(input);
  return Boolean(endpointSpec?.parameters);
}

export function isTextModelParameterSupported(
  input: TextModelSpecInput & { key: TextModelParameterKey },
) {
  if (!hasExplicitTextParameterCatalog(input)) return true;
  return Boolean(getTextModelParameterSpecification(input));
}

export function normalizeTextModelConfigBySpecification(
  config: Pick<
    LLMConfig,
    | "temperature"
    | "top_p"
    | "max_tokens"
    | "presence_penalty"
    | "frequency_penalty"
  >,
  input: TextModelSpecInput,
) {
  const nextConfig = { ...config };
  const explicitCatalog = hasExplicitTextParameterCatalog(input);

  (
    [
      "temperature",
      "top_p",
      "max_tokens",
      "presence_penalty",
      "frequency_penalty",
    ] as TextModelParameterKey[]
  ).forEach((key) => {
    const parameter = getTextModelParameterSpecification({
      ...input,
      key,
    });
    if (!parameter) {
      if (explicitCatalog) {
        delete (nextConfig as Record<string, any>)[key];
      }
      return;
    }
    const currentValue = nextConfig[key];
    nextConfig[key] = clampNumericValue(currentValue, parameter);
  });

  return nextConfig;
}
