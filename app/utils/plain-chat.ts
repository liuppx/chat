import type { ModelConfig } from "../store/config";
import type { Skill } from "../store/skill";

export function disablePlainChatReasoning(modelConfig: ModelConfig) {
  return {
    ...modelConfig,
    reasoningMode: "off" as const,
    reasoningEffort: modelConfig.reasoningEffort ?? "medium",
  };
}

export function isPlainChatSkill(skill: Skill) {
  return (
    !skill.builtin &&
    !skill.description &&
    !skill.category &&
    !skill.starters?.length &&
    !skill.context?.length &&
    !skill.plugin?.length &&
    !skill.tools?.builtInTools?.length &&
    !skill.tools?.mcpTools?.length &&
    !skill.tools?.apiTools?.length &&
    !skill.launch
  );
}
