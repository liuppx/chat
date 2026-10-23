export type ToolConfigPropertyLike = {
  type: string;
  required?: boolean;
  minItems?: number;
  sensitive?: boolean;
};

export function redactToolServerConfig<
  T extends {
    env?: Record<string, string>;
    secretEnvKeys?: string[];
  },
>(server: T): T {
  const env = { ...(server.env ?? {}) };
  for (const key of server.secretEnvKeys ?? []) delete env[key];
  return { ...server, env };
}

export function preserveEmptyToolSecrets(
  env: Record<string, string>,
  existingEnv: Record<string, string> | undefined,
  secretEnvKeys: string[],
) {
  const nextEnv = { ...env };
  for (const key of secretEnvKeys) {
    if (
      (nextEnv[key] === undefined || nextEnv[key] === "") &&
      existingEnv?.[key] !== undefined
    ) {
      nextEnv[key] = existingEnv[key];
    }
  }
  return nextEnv;
}

export function readToolConfigBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return false;

  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

export function stringifyToolConfigValue(value: unknown) {
  if (typeof value === "string") return value;
  if (typeof value === "boolean" || typeof value === "number") {
    return String(value);
  }
  return undefined;
}

export function getMissingToolConfigKeys(
  properties: Record<string, ToolConfigPropertyLike>,
  values: Record<string, unknown>,
  preservedKeys: string[] = [],
) {
  return Object.entries(properties)
    .filter(([, property]) => property.required)
    .filter(([key]) => !preservedKeys.includes(key))
    .filter(([key, property]) => {
      const value = values[key];

      if (property.type === "array") {
        if (!Array.isArray(value)) return true;
        const minItems = property.minItems ?? 1;
        return value.filter((item) => String(item).trim()).length < minItems;
      }

      if (property.type === "boolean") {
        return false;
      }

      return typeof value !== "string" || value.trim().length === 0;
    })
    .map(([key]) => key);
}
