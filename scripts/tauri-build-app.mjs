import { spawn } from "node:child_process";
import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
import tauriConfig from "../src-tauri/tauri.conf.json" with { type: "json" };

const rootDir = process.cwd();
const releaseMode = process.argv.includes("--release-updater");
const tempConfigPath = path.join(rootDir, "src-tauri", "tauri.release.conf.json");

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      env: process.env,
      stdio: "inherit",
      shell: process.platform === "win32",
      ...options,
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

function resolveArch() {
  switch (process.arch) {
    case "arm64":
      return "aarch64";
    case "x64":
      return "x64";
    default:
      return process.arch;
  }
}

function resolveSigningKeySource() {
  if (process.env.TAURI_SIGNING_PRIVATE_KEY?.trim()) {
    return "TAURI_SIGNING_PRIVATE_KEY";
  }

  if (process.env.TAURI_SIGNING_PRIVATE_KEY_PATH?.trim()) {
    return "TAURI_SIGNING_PRIVATE_KEY_PATH";
  }

  return null;
}

function validateReleaseSigningEnv() {
  const signingKeySource = resolveSigningKeySource();
  if (!signingKeySource) {
    throw new Error(
      "Release updater build requires TAURI_SIGNING_PRIVATE_KEY or TAURI_SIGNING_PRIVATE_KEY_PATH.",
    );
  }

  if (!process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD?.trim()) {
    throw new Error(
      "Release updater build requires TAURI_SIGNING_PRIVATE_KEY_PASSWORD.",
    );
  }

  return signingKeySource;
}

async function withReleaseUpdaterConfig(callback) {
  const releaseConfig = {
    bundle: {
      createUpdaterArtifacts: true,
      ...(process.platform === "linux"
        ? { targets: ["deb", "appimage"] }
        : {}),
    },
  };

  await fs.writeFile(tempConfigPath, JSON.stringify(releaseConfig, null, 2));

  try {
    await callback(tempConfigPath);
  } finally {
    try {
      await fs.unlink(tempConfigPath);
    } catch {}
  }
}

async function buildTauri(configPath) {
  const args = ["tauri", "build"];

  if (process.platform === "linux") {
    if (configPath) {
      args.push("--config", configPath);
    }
  } else {
    args.push("--bundles", "app");
    if (configPath) {
      args.push("--config", configPath);
    }
  }

  await run("npx", args);
}

async function buildDmg() {
  const productName = tauriConfig.productName;
  const version = tauriConfig.version;
  const arch = resolveArch();
  const macosDir = path.join(rootDir, "src-tauri", "target", "release", "bundle", "macos");
  const dmgDir = path.join(rootDir, "src-tauri", "target", "release", "bundle", "dmg");
  const bundleScript = path.join(dmgDir, "bundle_dmg.sh");
  const iconPath = path.join(dmgDir, "icon.icns");
  const appName = `${productName}.app`;
  const dmgName = `${productName}_${version}_${arch}.dmg`;
  const dmgPath = path.join(macosDir, dmgName);
  const tempDmgSuffix = `.${dmgName}`;

  if (!existsSync(bundleScript)) {
    throw new Error(`Missing DMG bundler script: ${bundleScript}`);
  }

  for (const entry of await fs.readdir(macosDir)) {
    if (entry.startsWith("rw.") && entry.endsWith(tempDmgSuffix)) {
      await fs.unlink(path.join(macosDir, entry));
    }
  }

  if (existsSync(dmgPath)) {
    await fs.unlink(dmgPath);
  }

  await run(
    bundleScript,
    [
      "--skip-jenkins",
      "--volname",
      productName,
      "--icon",
      appName,
      "180",
      "170",
      "--app-drop-link",
      "480",
      "170",
      "--window-size",
      "660",
      "400",
      "--hide-extension",
      appName,
      "--volicon",
      iconPath,
      dmgName,
      appName,
    ],
    { cwd: macosDir },
  );

  for (const entry of await fs.readdir(macosDir)) {
    if (entry.startsWith("rw.") && entry.endsWith(tempDmgSuffix)) {
      await fs.unlink(path.join(macosDir, entry));
    }
  }
}

await run("npm", ["run", "skill"]);

if (releaseMode) {
  const signingKeySource = validateReleaseSigningEnv();
  console.log(`[Tauri] updater release build enabled via ${signingKeySource}`);

  await withReleaseUpdaterConfig(async (configPath) => {
    await buildTauri(configPath);
  });
} else {
  await buildTauri();
}

if (process.platform === "darwin") {
  await buildDmg();
}
