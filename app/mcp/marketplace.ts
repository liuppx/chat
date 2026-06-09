import { COMMUNITY_MARKETPLACE_MCP_PACKAGES_URL } from "../constant";
import { PresetServer } from "./types";

type MarketplaceMcpServer = PresetServer & {
  schemaVersion?: string;
  version?: string;
  release?: {
    status?: "published" | "draft" | "removed";
    review?: "approved" | "pending" | "rejected";
  };
};

function isValidPresetServer(
  server: MarketplaceMcpServer,
): server is PresetServer {
  return Boolean(
    server &&
    typeof server.id === "string" &&
    typeof server.name === "string" &&
    typeof server.description === "string" &&
    typeof server.repo === "string" &&
    Array.isArray(server.tags) &&
    typeof server.command === "string" &&
    Array.isArray(server.baseArgs) &&
    typeof server.configurable === "boolean",
  );
}

export async function fetchCommunityMcpPresetServers(signal?: AbortSignal) {
  const response = await fetch(COMMUNITY_MARKETPLACE_MCP_PACKAGES_URL, {
    signal,
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const servers = (await response.json()) as MarketplaceMcpServer[];
  if (!Array.isArray(servers)) return [];

  return servers.filter((server) => {
    if (server.release?.status && server.release.status !== "published") {
      return false;
    }
    return isValidPresetServer(server);
  });
}

export function mergeMcpPresetServers(
  officialServers: PresetServer[],
  communityServers: PresetServer[],
) {
  const merged = new Map<string, PresetServer>();
  communityServers.forEach((server) => merged.set(server.id, server));
  officialServers.forEach((server) => merged.set(server.id, server));
  return Array.from(merged.values());
}
