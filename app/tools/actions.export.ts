import {
  ListToolsResponse,
  ToolConfigData,
  McpRequestMessage,
  ServerConfig,
  ServerStatusResponse,
  ToolInstallConfirmation,
} from "./types";
import { confirm } from "@tauri-apps/plugin-dialog";
import { tauriInvoke } from "../tauri";

function getCommandPreview(config: ServerConfig) {
  return [config.command, ...config.args].join(" ");
}

export async function getClientsStatus(): Promise<
  Record<string, ServerStatusResponse>
> {
  return tauriInvoke("tool_get_status");
}

export async function getClientTools(
  clientId: string,
): Promise<ListToolsResponse | null> {
  try {
    return await tauriInvoke("tool_get_client_tools", { serverId: clientId });
  } catch {
    return null;
  }
}

export async function getAvailableClientsCount() {
  const statuses = await getClientsStatus();
  return Object.values(statuses).filter((status) => status.status === "active")
    .length;
}

export async function getAllTools() {
  const config = await getToolConfigFromFile();
  return Promise.all(
    Object.keys(config.toolServers).map(async (clientId) => ({
      clientId,
      tools: await getClientTools(clientId),
    })),
  );
}

export async function initializeToolSystem(): Promise<ToolConfigData> {
  return tauriInvoke("tool_initialize");
}

export async function addToolServer(
  clientId: string,
  config: ServerConfig,
  confirmation?: ToolInstallConfirmation,
): Promise<ToolConfigData> {
  const details = confirmation ?? {
    name: clientId,
    repo: "",
    permissions: [],
    requirements: [],
  };
  const message = [
    `Start ${details.name} on this device?`,
    details.repo ? `Source: ${details.repo}` : "",
    `Command: ${getCommandPreview(config)}`,
    details.requirements.length
      ? `Requirements:\n- ${details.requirements.join("\n- ")}`
      : "",
    details.permissions.length
      ? `Permissions:\n- ${details.permissions
          .map((permission) => permission.description || permission.id)
          .join("\n- ")}`
      : "",
    "The command can access this user account and may download code. Only continue if you trust this source.",
  ]
    .filter(Boolean)
    .join("\n\n");
  const accepted = await confirm(message, {
    title: "Run local MCP server",
    kind: "warning",
    okLabel: "Run",
    cancelLabel: "Cancel",
  });
  if (!accepted)
    throw new Error("Starting the local tool server was cancelled");
  return tauriInvoke("tool_add_server", {
    serverId: clientId,
    config,
    confirmed: true,
  });
}

export async function pauseToolServer(
  clientId: string,
): Promise<ToolConfigData> {
  return tauriInvoke("tool_pause_server", { serverId: clientId });
}

export async function resumeToolServer(clientId: string): Promise<void> {
  return tauriInvoke("tool_resume_server", { serverId: clientId });
}

export async function removeToolServer(
  clientId: string,
): Promise<ToolConfigData> {
  return tauriInvoke("tool_remove_server", { serverId: clientId });
}

export async function restartAllClients(): Promise<ToolConfigData> {
  return tauriInvoke("tool_restart_all");
}

export async function executeToolAction(
  clientId: string,
  request: McpRequestMessage,
) {
  return tauriInvoke("tool_execute_request", {
    serverId: clientId,
    request,
  });
}

export async function getToolConfigFromFile(): Promise<ToolConfigData> {
  return tauriInvoke("tool_get_config");
}

export async function isToolRuntimeEnabled(): Promise<boolean> {
  return true;
}
