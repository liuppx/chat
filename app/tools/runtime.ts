import type { PresetServer, ToolPlatform, ToolRuntime } from "./types";

export function filterToolPresetServersForRuntime(
  servers: PresetServer[],
  runtime: ToolRuntime,
  platform: ToolPlatform,
) {
  return servers.filter((server) => {
    if (!(server.runtimes ?? ["standalone"]).includes(runtime)) return false;
    return (
      runtime !== "desktop" ||
      (server.platforms ?? ["macos", "windows", "linux"]).includes(platform)
    );
  });
}

export function getCurrentToolPlatform(): ToolPlatform {
  const platform =
    typeof navigator === "undefined" ? "" : navigator.platform.toLowerCase();
  if (platform.includes("win")) return "windows";
  if (platform.includes("mac") || platform.includes("iphone")) return "macos";
  return "linux";
}
