import { LLMModel } from "../client/api";
import { ModelConfig } from "../store/config";
import { ServerStatusResponse } from "../mcp/types";
import type { Skill } from "../store/skill";
import {
  collectModelsWithDefaultModel,
  filterModelsByCandidates,
  matchesModelCandidate,
  normalizeModelCandidates,
} from "../utils/model";

export type SkillRuntimeStatus = "ready" | "needs_config" | "unavailable";

export type SkillRuntimeIssueType =
  | "model"
  | "api_tool"
  | "mcp_missing"
  | "mcp_inactive";

export type SkillRuntimeIssue = {
  type: SkillRuntimeIssueType;
  message: string;
};

export type SkillRuntimeResult = {
  status: SkillRuntimeStatus;
  issues: SkillRuntimeIssue[];
};

export function getSkillRuntimeStatusOrder(status: SkillRuntimeStatus) {
  switch (status) {
    case "ready":
      return 0;
    case "needs_config":
      return 1;
    case "unavailable":
      return 2;
    default:
      return 3;
  }
}

export function getSkillRuntimeIssueSummary(result: SkillRuntimeResult) {
  return result.issues.map((issue) => issue.message).join(" · ");
}

export function hasSkillMcpRuntimeIssue(result?: SkillRuntimeResult) {
  return (
    result?.issues.some(
      (issue) => issue.type === "mcp_missing" || issue.type === "mcp_inactive",
    ) ?? false
  );
}

function getSkillApiTools(skill: Skill) {
  return skill.tools?.apiTools ?? skill.plugin ?? [];
}

function getSkillMcpTools(skill: Skill) {
  return skill.tools?.mcpTools ?? [];
}

export function resolveSkillRuntimeStatus(params: {
  skill: Skill;
  models: readonly LLMModel[];
  customModels?: string;
  accessCustomModels?: string;
  defaultModel?: string;
  globalModelConfig: ModelConfig;
  installedPluginIds?: readonly string[];
  installedMcpServerIds?: readonly string[];
  mcpStatuses?: Record<string, ServerStatusResponse | undefined>;
}): SkillRuntimeResult {
  const {
    skill,
    models,
    customModels,
    accessCustomModels,
    defaultModel,
    globalModelConfig,
    installedPluginIds,
    installedMcpServerIds,
    mcpStatuses,
  } = params;

  const runtimeModels = collectModelsWithDefaultModel(
    models,
    [customModels, accessCustomModels].filter(Boolean).join(","),
    defaultModel ?? "",
  ).filter((model) => model.available);
  const candidateModels = normalizeModelCandidates(skill.candidateModels);
  const sessionModels = filterModelsByCandidates(
    runtimeModels,
    candidateModels,
  );
  const shouldSyncFromGlobal = skill.syncGlobalConfig !== false;
  const nextModelConfig = shouldSyncFromGlobal
    ? { ...globalModelConfig }
    : {
        ...globalModelConfig,
        ...skill.modelConfig,
      };
  const hasCandidateModelRestriction = candidateModels.length > 0;
  const hasCurrentModel = sessionModels.some((model) =>
    matchesModelCandidate(model, {
      model: nextModelConfig.model,
      providerName: nextModelConfig.providerName,
    }),
  );
  const pluginIdSet = new Set(installedPluginIds ?? []);
  const missingPluginCount = getSkillApiTools(skill).filter(
    (id) => !pluginIdSet.has(id),
  ).length;
  const mcpServerIdSet = new Set(installedMcpServerIds ?? []);
  const mcpTools = getSkillMcpTools(skill);
  const missingMcpServerCount = mcpTools.filter(
    (id) => !mcpServerIdSet.has(id),
  ).length;
  const inactiveMcpServerCount = mcpTools.filter((id) => {
    if (!mcpServerIdSet.has(id)) return false;
    if (!mcpStatuses) return false;
    return mcpStatuses[id]?.status !== "active";
  }).length;

  const issues: SkillRuntimeIssue[] = [];

  if (runtimeModels.length === 0) {
    issues.push({
      type: "model",
      message: "当前没有任何可用模型",
    });
    return {
      status: "unavailable",
      issues,
    };
  }

  if (hasCandidateModelRestriction && sessionModels.length === 0) {
    issues.push({
      type: "model",
      message: "候选模型当前都不可用",
    });
    return {
      status: "unavailable",
      issues,
    };
  }

  if (!hasCandidateModelRestriction && !hasCurrentModel) {
    issues.push({
      type: "model",
      message: "默认模型需要调整",
    });
  }

  if (missingPluginCount > 0) {
    issues.push({
      type: "api_tool",
      message:
        missingPluginCount === 1
          ? "缺少 1 个工具配置"
          : `缺少 ${missingPluginCount} 个工具配置`,
    });
  }

  if (missingMcpServerCount > 0) {
    issues.push({
      type: "mcp_missing",
      message:
        missingMcpServerCount === 1
          ? "缺少 1 个 MCP 配置"
          : `缺少 ${missingMcpServerCount} 个 MCP 配置`,
    });
  }

  if (inactiveMcpServerCount > 0) {
    issues.push({
      type: "mcp_inactive",
      message:
        inactiveMcpServerCount === 1
          ? "1 个 MCP 未正常运行"
          : `${inactiveMcpServerCount} 个 MCP 未正常运行`,
    });
  }

  return {
    status: issues.length > 0 ? "needs_config" : "ready",
    issues,
  };
}
