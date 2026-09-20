import { promises as fs } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const rootDir = process.cwd();
const appDir = path.join(rootDir, "app");
const disabledSuffix = ".export-disabled";
const toolActionsPath = path.join(appDir, "tools", "actions.ts");
const toolActionsExportPath = path.join(appDir, "tools", "actions.export.ts");

async function findRouteFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return findRouteFiles(fullPath);
      }
      if (entry.isFile() && entry.name === "route.ts") {
        return [fullPath];
      }
      return [];
    }),
  );

  return files.flat();
}

async function findFilesWithSuffix(dir, suffix) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return findFilesWithSuffix(fullPath, suffix);
      }
      return entry.isFile() && entry.name.endsWith(suffix) ? [fullPath] : [];
    }),
  );

  return files.flat();
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function run(command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      env,
      stdio: "inherit",
      shell: process.platform === "win32",
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(" ")} failed with exit code ${code}`));
      }
    });

    child.on("error", reject);
  });
}

async function disableRoutes(routeFiles) {
  const renamed = [];
  try {
    for (const file of routeFiles) {
      const disabledPath = `${file}${disabledSuffix}`;
      await fs.rename(file, disabledPath);
      renamed.push([disabledPath, file]);
    }
  } catch (error) {
    await restoreRoutes(renamed);
    throw error;
  }
  return renamed;
}

async function restoreRoutes(renamedFiles) {
  const results = await Promise.allSettled(
    renamedFiles.map(([from, to]) => fs.rename(from, to)),
  );
  const failed = results.filter((result) => result.status === "rejected");
  if (failed.length > 0) {
    throw new Error(
      `Failed to restore ${failed.length} server route file(s): ${failed
        .map((result) => String(result.reason))
        .join("; ")}`,
    );
  }
}

async function swapToolActions() {
  const backupPath = `${toolActionsPath}${disabledSuffix}`;
  await fs.rename(toolActionsPath, backupPath);
  try {
    await fs.copyFile(toolActionsExportPath, toolActionsPath);
  } catch (error) {
    await fs.rename(backupPath, toolActionsPath);
    throw error;
  }

  return async () => {
    await fs.unlink(toolActionsPath);
    await fs.rename(backupPath, toolActionsPath);
  };
}

async function recoverInterruptedExport() {
  const staleRoutes = await findFilesWithSuffix(
    appDir,
    `route.ts${disabledSuffix}`,
  );
  const staleToolActionsPath = `${toolActionsPath}${disabledSuffix}`;
  const hasStaleToolActions = await pathExists(staleToolActionsPath);

  if (staleRoutes.length === 0 && !hasStaleToolActions) return;

  for (const disabledPath of staleRoutes) {
    const routePath = disabledPath.slice(0, -disabledSuffix.length);
    if (await pathExists(routePath)) {
      throw new Error(
        `Cannot recover interrupted export: both ${routePath} and ${disabledPath} exist. Resolve the conflict before building.`,
      );
    }
    await fs.rename(disabledPath, routePath);
  }

  if (hasStaleToolActions) {
    if (await pathExists(toolActionsPath)) {
      const [current, exportVersion] = await Promise.all([
        fs.readFile(toolActionsPath),
        fs.readFile(toolActionsExportPath),
      ]);
      if (!current.equals(exportVersion)) {
        throw new Error(
          `Cannot recover interrupted export: ${toolActionsPath} differs from the desktop export replacement. Resolve it before building.`,
        );
      }
      await fs.unlink(toolActionsPath);
    }
    await fs.rename(staleToolActionsPath, toolActionsPath);
  }

  console.warn(
    `[Export] recovered ${staleRoutes.length} route file(s) from an interrupted export build`,
  );
}

await recoverInterruptedExport();

let renamedFiles = [];
let restoreToolActions;

try {
  const routeFiles = await findRouteFiles(appDir);
  renamedFiles = await disableRoutes(routeFiles);
  restoreToolActions = await swapToolActions();
  await run("npm", ["run", "skill"]);
  await run(
    "npx",
    ["cross-env", "BUILD_MODE=export", "BUILD_APP=1", "next", "build", "--webpack"],
    { ...process.env, BUILD_MODE: "export", BUILD_APP: "1" },
  );
} finally {
  const restoreErrors = [];
  if (restoreToolActions) {
    try {
      await restoreToolActions();
    } catch (error) {
      restoreErrors.push(error);
    }
  }
  try {
    await restoreRoutes(renamedFiles);
  } catch (error) {
    restoreErrors.push(error);
  }
  if (restoreErrors.length > 0) {
    throw new AggregateError(
      restoreErrors,
      "Static export completed with source restoration failures",
    );
  }
}
