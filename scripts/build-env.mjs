import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const NEXT_RUNTIME_ENV_FILES = [
  ".env",
  ".env.production",
  ".env.local",
  ".env.production.local",
];
const RUNTIME_ENV_KEY_FILES = [".env.template", ...NEXT_RUNTIME_ENV_FILES];
const BUILD_ONLY_KEYS = new Set(["BUILD_VERSION", "DISABLE_CHUNK"]);

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) return new Map();

  const values = new Map();
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;

    let value = match[2];
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    values.set(match[1], value);
  }
  return values;
}

export function loadBuildEnvironment(
  rootDir,
  processEnv = process.env,
  { includeArtifactDefaults = true } = {},
) {
  const inheritedKeys = new Set(Object.keys(processEnv));
  const buildValues = parseEnvFile(path.join(rootDir, ".env.build"));

  for (const [key, value] of buildValues) {
    if (
      !inheritedKeys.has(key) &&
      (includeArtifactDefaults || BUILD_ONLY_KEYS.has(key))
    ) {
      processEnv[key] = value;
    }
  }

  // Next scans its standard .env files during builds. Predefine all known
  // runtime keys so those files cannot leak values into build artifacts.
  for (const fileName of RUNTIME_ENV_KEY_FILES) {
    const runtimeValues = parseEnvFile(path.join(rootDir, fileName));
    for (const key of runtimeValues.keys()) {
      const hasArtifactValue =
        includeArtifactDefaults &&
        (inheritedKeys.has(key) || buildValues.has(key));
      if (!hasArtifactValue && !BUILD_ONLY_KEYS.has(key)) {
        processEnv[key] = "";
      }
    }
  }

  return {
    buildEnvPath: path.join(rootDir, ".env.build"),
    buildEnvFound: existsSync(path.join(rootDir, ".env.build")),
  };
}
