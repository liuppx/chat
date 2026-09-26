import { spawn } from "node:child_process";
import path from "node:path";
import { loadBuildEnvironment } from "./build-env.mjs";

const rootDir = process.cwd();

loadBuildEnvironment(rootDir, process.env, {
  includeArtifactDefaults: false,
});

const child = spawn(
  "npx",
  ["cross-env", "BUILD_MODE=standalone", "next", "build", "--webpack"],
  {
    cwd: path.resolve(rootDir),
    env: { ...process.env, BUILD_MODE: "standalone", BUILD_APP: "0" },
    stdio: "inherit",
    shell: process.platform === "win32",
  },
);

child.on("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});

child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
