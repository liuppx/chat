import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import clsx from "clsx";

import { COMMUNITY_MARKETPLACE_SKILL_PACKAGES_URL, Path } from "../constant";
import Locale, { getLang, type Lang } from "../locales";
import {
  addMcpServer,
  getClientsStatus,
  getMcpConfigFromFile,
} from "../mcp/actions";
import {
  fetchCommunityMcpPresetServers,
  mergeMcpPresetServers,
} from "../mcp/marketplace";
import { OFFICIAL_MCP_PRESET_SERVERS } from "../mcp/preset-servers";
import {
  McpConfigData,
  PresetServer,
  ServerStatusResponse,
} from "../mcp/types";
import {
  BUILTIN_SKILLS,
  resolveLocalizedText,
  type SkillPackage,
  skillPackageToSkill,
} from "../skills";
import { useAppConfig, useChatStore } from "../store";
import {
  Skill,
  getSkillApiTools,
  getSkillBuiltInTools,
  getSkillMcpTools,
  useSkillStore,
} from "../store/skill";
import { usePluginStore } from "../store/plugin";
import { IconButton } from "./button";
import { ErrorBoundary } from "./error";
import { List, ListItem, Modal, showToast } from "./ui-lib";
import { SkillConfig } from "./mask";
import AddIcon from "../icons/add.svg";
import BrainIcon from "../icons/brain.svg";
import CloseIcon from "../icons/close.svg";
import DeleteIcon from "../icons/delete.svg";
import EditIcon from "../icons/edit.svg";
import EyeIcon from "../icons/eye.svg";
import ModelServiceIcon from "../icons/llm-icons/default.svg";
import ToolIcon from "../icons/tool.svg";
import styles from "./discovery.module.scss";
import { useAccessStore } from "../store/access";
import { useSdStore } from "../store/sd";
import {
  getSkillRuntimeIssueSummary,
  getSkillRuntimeStatusOrder,
  hasSkillMcpRuntimeIssue,
  resolveSkillRuntimeStatus,
  SkillRuntimeResult,
  SkillRuntimeStatus,
} from "../skills/runtime";

type CapabilityType = "all" | "skill" | "mcp" | "provider";
type PricingType = "free" | "subscription" | "usage";
type RuntimeType = "cloud" | "local" | "both";
type DiscoveryView = "market" | "mine";
type SkillPackageList = Partial<Record<Lang, SkillPackage[]>>;
type DiscoveryConfigProperty = {
  type: string;
  description?: string;
  required?: boolean;
  minItems?: number;
  itemLabel?: string;
  addButtonText?: string;
  helpUrl?: string;
  helpLabel?: string;
};

type Capability = {
  id: string;
  type: Exclude<CapabilityType, "all">;
  title: string;
  description: string;
  highlights: string[];
  status: string;
  pricing: PricingType;
  runtime: RuntimeType;
  source: string;
  path: Path;
  installed: boolean;
  skill?: Skill;
  skillPackage?: SkillPackage;
  skillPackageLang?: Lang;
  runtimeStatus?: SkillRuntimeStatus;
  runtimeResult?: SkillRuntimeResult;
  presetServer?: PresetServer;
};

const typeOrder: CapabilityType[] = ["all", "skill", "mcp", "provider"];

function getInitialType(search: string): CapabilityType {
  const type = new URLSearchParams(search).get("type");
  if (type === "model") return "provider";
  if (type === "tool") return "mcp";
  if (type === "skill" || type === "mcp" || type === "provider") return type;
  return "all";
}

function getInitialView(search: string): DiscoveryView {
  return new URLSearchParams(search).get("view") === "mine" ? "mine" : "market";
}

function getDiscoveryPath(view: DiscoveryView, type: CapabilityType) {
  const params = new URLSearchParams();
  if (view === "mine") params.set("view", view);
  if (type !== "all") params.set("type", type);
  const query = params.toString();
  return query ? `${Path.Discovery}?${query}` : Path.Discovery;
}

function getBuiltinSkillPackageId(skill: Skill) {
  return `builtin.${skill.lang}.${skill.createdAt}`;
}

function getSkillPackageId(skill: Skill) {
  return skill.packageId || getBuiltinSkillPackageId(skill);
}

function getCapabilityIcon(type: Capability["type"]) {
  if (type === "skill") return <BrainIcon />;
  if (type === "mcp") return <ToolIcon />;
  return <ModelServiceIcon />;
}

export function DiscoveryPage() {
  const navigate = useNavigate();
  const chatStore = useChatStore();
  const skillStore = useSkillStore();
  const sdStore = useSdStore();
  const location = useLocation();
  const view = getInitialView(location.search);
  const activeType = getInitialType(location.search);
  const [searchText, setSearchText] = useState("");
  const deferredSearchText = useDeferredValue(searchText);
  const skillRecords = useSkillStore((state) => state.skills);
  const pluginRecords = usePluginStore((state) => state.plugins);
  const models = useAppConfig((state) => state.models);
  const hideBuiltinSkills = useAppConfig((state) => state.hideBuiltinSkills);
  const modelConfig = useAppConfig((state) => state.modelConfig);
  const customModels = useAppConfig((state) => state.customModels);
  const accessCustomModels = useAccessStore((state) => state.customModels);
  const defaultModel = useAccessStore((state) => state.defaultModel);
  const [mcpConfig, setMcpConfig] = useState<McpConfigData>();
  const [mcpStatuses, setMcpStatuses] = useState<
    Record<string, ServerStatusResponse> | undefined
  >();
  const [communitySkillPackages, setCommunitySkillPackages] =
    useState<SkillPackageList>({});
  const [communityMcpServers, setCommunityMcpServers] = useState<
    PresetServer[]
  >([]);
  const [editingMcpServerId, setEditingMcpServerId] = useState<string>();
  const [viewingMcpCapability, setViewingMcpCapability] =
    useState<Capability>();
  const [editingSkillId, setEditingSkillId] = useState<string>();
  const [mcpUserConfig, setMcpUserConfig] = useState<Record<string, any>>({});
  const [savingMcpConfig, setSavingMcpConfig] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const loadMcpState = async () => {
      try {
        const [config, statuses] = await Promise.all([
          getMcpConfigFromFile(),
          getClientsStatus(),
        ]);
        if (cancelled) return;
        setMcpConfig(config);
        setMcpStatuses(statuses);
      } catch (error) {
        console.warn("[Discovery] failed to load MCP state", error);
      }
    };
    loadMcpState();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    fetchCommunityMcpPresetServers(controller.signal)
      .then((servers) => {
        if (!controller.signal.aborted) {
          setCommunityMcpServers(servers);
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          console.warn(
            "[Discovery] failed to load community MCP package list",
            error,
          );
        }
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    fetch(COMMUNITY_MARKETPLACE_SKILL_PACKAGES_URL, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        return res.json() as Promise<SkillPackageList>;
      })
      .then((packages) => {
        if (!controller.signal.aborted) {
          setCommunitySkillPackages(packages);
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          console.warn(
            "[Discovery] failed to load community skill package list",
            error,
          );
        }
      });

    return () => controller.abort();
  }, []);

  const skills = useMemo<Skill[]>(() => {
    const userSkills = Object.values(skillRecords).sort(
      (a, b) => b.createdAt - a.createdAt,
    );
    if (hideBuiltinSkills) return userSkills;

    const enabledPackageIds = new Set(
      userSkills.map((skill) => skill.packageId).filter(Boolean),
    );
    const seen = new Set<string>();
    const builtinSkills = BUILTIN_SKILLS.filter((skill) => {
      if (skill.lang !== getLang() || seen.has(skill.name)) return false;
      seen.add(skill.name);
      if (enabledPackageIds.has(getBuiltinSkillPackageId(skill as Skill))) {
        return false;
      }
      return true;
    }).map((skill) => {
      const builtinSkill = skill as Skill;
      return {
        ...builtinSkill,
        packageId: getBuiltinSkillPackageId(builtinSkill),
        modelConfig: {
          ...modelConfig,
          ...builtinSkill.modelConfig,
        },
      };
    });

    return [...userSkills, ...builtinSkills];
  }, [hideBuiltinSkills, modelConfig, skillRecords]);
  const editingSkill = useMemo(
    () => skills.find((skill) => String(skill.id) === editingSkillId),
    [editingSkillId, skills],
  );
  const plugins = useMemo(
    () =>
      Object.values(pluginRecords).sort((a, b) => b.createdAt - a.createdAt),
    [pluginRecords],
  );

  const capabilities = useMemo<Capability[]>(() => {
    const installedPluginIds = plugins.map((plugin) => plugin.id);
    const installedMcpServerIds = Object.keys(mcpConfig?.mcpServers ?? {});
    const mcpPresetServers = mergeMcpPresetServers(
      OFFICIAL_MCP_PRESET_SERVERS,
      communityMcpServers,
    );
    const currentLang = getLang();
    const installedPackageIds = new Set(
      Object.values(skillRecords)
        .map((skill) => skill.packageId)
        .filter(Boolean),
    );
    const skillItems = skills
      .map((skill) => {
        const runtimeSkill = skill as Skill;
        const skillToolCount =
          getSkillBuiltInTools(runtimeSkill).length +
          getSkillMcpTools(runtimeSkill).length +
          getSkillApiTools(runtimeSkill).length;
        const runtime = resolveSkillRuntimeStatus({
          skill: runtimeSkill,
          models,
          customModels,
          accessCustomModels,
          defaultModel,
          globalModelConfig: modelConfig,
          installedPluginIds,
          installedMcpServerIds,
          mcpStatuses,
        });
        const runtimeSummary = getSkillRuntimeIssueSummary(runtime);
        return {
          id: `skill:${skill.id}`,
          type: "skill" as const,
          title: skill.name,
          description: skill.description || Locale.Discovery.DefaultSkillDesc,
          highlights: [
            skill.category,
            skill.starters?.length
              ? Locale.Discovery.SkillStarters(skill.starters.length)
              : undefined,
            skillToolCount
              ? Locale.Discovery.SkillTools(skillToolCount)
              : undefined,
            runtimeSummary || undefined,
          ].filter(Boolean) as string[],
          status:
            !skill.builtin && runtime.status === "ready"
              ? Locale.Discovery.Status.Enabled
              : runtime.status === "unavailable"
                ? Locale.Discovery.Status.Unavailable
                : Locale.Discovery.Status.Configurable,
          pricing: "free" as const,
          runtime: "both" as const,
          source: skill.builtin
            ? Locale.Discovery.Source.Official
            : Locale.Discovery.Source.Custom,
          path: Path.Skills,
          installed: !skill.builtin,
          skill: runtimeSkill,
          runtimeStatus: runtime.status,
          runtimeResult: runtime,
        };
      })
      .sort((a, b) => {
        const statusDiff =
          getSkillRuntimeStatusOrder(a.runtimeStatus ?? "unavailable") -
          getSkillRuntimeStatusOrder(b.runtimeStatus ?? "unavailable");
        if (statusDiff !== 0) return statusDiff;
        return a.title.localeCompare(b.title);
      });

    const communitySkillItems = (communitySkillPackages[currentLang] ?? [])
      .filter((skillPackage) => !installedPackageIds.has(skillPackage.id))
      .map((skillPackage) => {
        const skill = skillPackageToSkill(
          skillPackage,
          currentLang,
          modelConfig,
        );
        skill.packageId = skillPackage.id;

        const skillToolCount =
          getSkillBuiltInTools(skill).length +
          getSkillMcpTools(skill).length +
          getSkillApiTools(skill).length;
        const runtime = resolveSkillRuntimeStatus({
          skill,
          models,
          customModels,
          accessCustomModels,
          defaultModel,
          globalModelConfig: modelConfig,
          installedPluginIds,
          installedMcpServerIds,
          mcpStatuses,
        });
        const runtimeSummary = getSkillRuntimeIssueSummary(runtime);

        return {
          id: `community-skill:${currentLang}:${skillPackage.id}`,
          type: "skill" as const,
          title: resolveLocalizedText(
            skillPackage.name,
            currentLang,
            skillPackage.id,
          ),
          description: resolveLocalizedText(
            skillPackage.description,
            currentLang,
            Locale.Discovery.DefaultSkillDesc,
          ),
          highlights: [
            skillPackage.category,
            skillPackage.starters?.length
              ? Locale.Discovery.SkillStarters(skillPackage.starters.length)
              : undefined,
            skillToolCount
              ? Locale.Discovery.SkillTools(skillToolCount)
              : undefined,
            runtimeSummary || undefined,
          ].filter(Boolean) as string[],
          status:
            runtime.status === "ready"
              ? Locale.Discovery.Status.Installable
              : runtime.status === "needs_config"
                ? Locale.Discovery.Status.Configurable
                : Locale.Discovery.Status.Unavailable,
          pricing: "free" as const,
          runtime: "both" as const,
          source: Locale.Discovery.Source.Community,
          path: Path.Skills,
          installed: false,
          skillPackage,
          skillPackageLang: currentLang,
          runtimeStatus: runtime.status,
          runtimeResult: runtime,
        };
      })
      .sort((a, b) => {
        const statusDiff =
          getSkillRuntimeStatusOrder(a.runtimeStatus ?? "unavailable") -
          getSkillRuntimeStatusOrder(b.runtimeStatus ?? "unavailable");
        if (statusDiff !== 0) return statusDiff;
        return a.title.localeCompare(b.title);
      });

    const officialMcpIds = new Set(
      OFFICIAL_MCP_PRESET_SERVERS.map((server) => server.id),
    );
    const mcpToolItems: Capability[] = mcpPresetServers.map((server) => {
      const serverConfig = mcpConfig?.mcpServers[server.id];
      const serverStatus = mcpStatuses?.[server.id]?.status;
      const installed = Boolean(serverConfig);
      const status =
        serverStatus === "active"
          ? Locale.Discovery.Status.Enabled
          : serverStatus === "error"
            ? Locale.Discovery.Status.Error
            : serverStatus === "paused"
              ? Locale.Discovery.Status.Paused
              : installed
                ? Locale.Discovery.Status.Installed
                : Locale.Discovery.Status.Configurable;

      return {
        id: `mcp:${server.id}`,
        type: "mcp",
        title: server.name,
        description: server.description,
        highlights: server.tags.slice(0, 3),
        status,
        pricing: "free",
        runtime: server.tags.includes("local") ? "local" : "both",
        source: officialMcpIds.has(server.id)
          ? Locale.Discovery.Source.Official
          : Locale.Discovery.Source.Community,
        path: Path.McpMarket,
        installed,
        presetServer: server,
      };
    });

    const mcpItems: Capability[] = [...mcpToolItems];

    const providerMap = new Map<
      string,
      {
        title: string;
        total: number;
        available: number;
        tags: Set<string>;
      }
    >();
    providerMap.set("router", {
      title: Locale.Discovery.RouterProviderTitle,
      total: 0,
      available: 0,
      tags: new Set(["router"]),
    });

    models.forEach((model) => {
      const providerName =
        model.provider?.providerName?.trim() ||
        model.ownedBy?.trim() ||
        Locale.Discovery.Source.Provider;
      const key = providerName.toLowerCase();
      const provider = providerMap.get(key) ?? {
        title: providerName,
        total: 0,
        available: 0,
        tags: new Set<string>(),
      };
      provider.total += 1;
      if (model.available) provider.available += 1;
      model.tags?.forEach((tag) => provider.tags.add(tag));
      providerMap.set(key, provider);
    });

    const providerItems: Capability[] = Array.from(providerMap.entries()).map(
      ([key, provider]) => ({
        id: `provider:${key}`,
        type: "provider",
        title: provider.title,
        description:
          provider.total > 0
            ? Locale.Discovery.ProviderDesc(
                provider.available,
                provider.total,
                Array.from(provider.tags).slice(0, 4),
              )
            : Locale.Discovery.RouterProviderDesc,
        highlights: Array.from(provider.tags).slice(0, 4),
        status:
          provider.available > 0 || key === "router"
            ? Locale.Discovery.Status.Enabled
            : Locale.Discovery.Status.Unavailable,
        pricing: "usage",
        runtime: "cloud",
        source:
          key === "router"
            ? Locale.Discovery.Source.Official
            : Locale.Discovery.Source.Provider,
        path: Path.Settings,
        installed: provider.available > 0 || key === "router",
      }),
    );

    const sortedProviderItems = providerItems.sort((a, b) => {
      if (a.id === "provider:router") return -1;
      if (b.id === "provider:router") return 1;
      return a.title.localeCompare(b.title);
    });

    return [
      ...skillItems,
      ...communitySkillItems,
      ...mcpItems,
      ...sortedProviderItems,
    ];
  }, [
    accessCustomModels,
    communityMcpServers,
    communitySkillPackages,
    customModels,
    defaultModel,
    mcpConfig?.mcpServers,
    mcpStatuses,
    modelConfig,
    models,
    plugins,
    skillRecords,
    skills,
  ]);

  const visibleCapabilities = capabilities.filter((item) => {
    const keyword = deferredSearchText.trim().toLowerCase();
    const matchType = activeType === "all" || item.type === activeType;
    const matchView = view === "market" || item.installed;
    const matchSearch =
      !keyword ||
      [
        item.title,
        item.description,
        item.source,
        item.status,
        ...item.highlights,
      ]
        .join(" ")
        .toLowerCase()
        .includes(keyword);
    return matchType && matchView && matchSearch;
  });

  const startSkill = (skill: Skill) => {
    if (skill.launch?.type === "sd") {
      sdStore.startBlankCreation();
      navigate(Path.Sd);
      return;
    }

    if (chatStore.newSession(skill) !== false) {
      navigate(Path.Chat);
    }
  };

  const enableSkill = (skill: Skill) => {
    const packageId = getSkillPackageId(skill);
    const existingSkill = Object.values(useSkillStore.getState().skills).find(
      (item) =>
        item.packageId === packageId ||
        (!item.builtin &&
          item.lang === skill.lang &&
          item.createdAt === skill.createdAt &&
          item.name === skill.name),
    );

    return (
      existingSkill ??
      useSkillStore.getState().create({
        ...skill,
        packageId,
      })
    );
  };

  useEffect(() => {
    if (!editingMcpServerId) return;
    const preset = communityMcpServers
      .concat(OFFICIAL_MCP_PRESET_SERVERS)
      .find((server) => server.id === editingMcpServerId);
    if (!preset?.configSchema) return;

    const currentConfig = mcpConfig?.mcpServers?.[editingMcpServerId];
    if (!currentConfig) {
      setMcpUserConfig({});
      return;
    }

    const nextUserConfig: Record<string, any> = {};
    Object.entries(preset.argsMapping || {}).forEach(([key, mapping]) => {
      if (mapping.type === "spread") {
        const startPos = mapping.position ?? 0;
        nextUserConfig[key] = currentConfig.args.slice(startPos);
      } else if (mapping.type === "single") {
        nextUserConfig[key] = currentConfig.args[mapping.position ?? 0];
      } else if (mapping.type === "env" && mapping.key && currentConfig.env) {
        nextUserConfig[key] = currentConfig.env[mapping.key];
      }
    });
    setMcpUserConfig(nextUserConfig);
  }, [communityMcpServers, editingMcpServerId, mcpConfig?.mcpServers]);

  const renderMcpPropertyDescription = (prop: DiscoveryConfigProperty) => {
    if (!prop.description && !prop.helpUrl) return undefined;
    return (
      <>
        {prop.description}
        {prop.helpUrl && (
          <>
            {prop.description ? " " : ""}
            <a href={prop.helpUrl} target="_blank" rel="noopener noreferrer">
              {prop.helpLabel || "Open Link"}
            </a>
          </>
        )}
      </>
    );
  };

  const renderMcpConfigForm = () => {
    const preset = mergeMcpPresetServers(
      OFFICIAL_MCP_PRESET_SERVERS,
      communityMcpServers,
    ).find((server) => server.id === editingMcpServerId);
    if (!preset?.configSchema) return null;

    return Object.entries(preset.configSchema.properties).map(
      ([key, prop]: [string, DiscoveryConfigProperty]) => {
        if (prop.type === "array") {
          const currentValue = mcpUserConfig[key] || [];
          const itemLabel = prop.itemLabel || key;
          const addButtonText = prop.addButtonText || `Add ${itemLabel}`;
          return (
            <ListItem
              key={key}
              title={key}
              subTitle={renderMcpPropertyDescription(prop)}
              vertical
            >
              <div className={styles["config-list"]}>
                {(currentValue as string[]).map(
                  (value: string, index: number) => (
                    <div
                      key={`${key}-${index}`}
                      className={styles["config-item"]}
                    >
                      <input
                        type="text"
                        value={value}
                        placeholder={`${itemLabel} ${index + 1}`}
                        onChange={(e) => {
                          const nextValue = [...currentValue] as string[];
                          nextValue[index] = e.currentTarget.value;
                          setMcpUserConfig({
                            ...mcpUserConfig,
                            [key]: nextValue,
                          });
                        }}
                      />
                      <IconButton
                        icon={<DeleteIcon />}
                        className={styles["config-delete"]}
                        onClick={() => {
                          const nextValue = [...currentValue] as string[];
                          nextValue.splice(index, 1);
                          setMcpUserConfig({
                            ...mcpUserConfig,
                            [key]: nextValue,
                          });
                        }}
                      />
                    </div>
                  ),
                )}
                <IconButton
                  icon={<AddIcon />}
                  text={addButtonText}
                  bordered
                  onClick={() => {
                    const nextValue = [...currentValue, ""] as string[];
                    setMcpUserConfig({ ...mcpUserConfig, [key]: nextValue });
                  }}
                />
              </div>
            </ListItem>
          );
        }

        const currentValue = mcpUserConfig[key] || "";
        return (
          <ListItem
            key={key}
            title={key}
            subTitle={renderMcpPropertyDescription(prop)}
          >
            <input
              aria-label={key}
              type="text"
              value={currentValue}
              placeholder={`Enter ${key}`}
              onChange={(e) =>
                setMcpUserConfig({
                  ...mcpUserConfig,
                  [key]: e.currentTarget.value,
                })
              }
            />
          </ListItem>
        );
      },
    );
  };

  const saveMcpServerConfig = async () => {
    const preset = mergeMcpPresetServers(
      OFFICIAL_MCP_PRESET_SERVERS,
      communityMcpServers,
    ).find((server) => server.id === editingMcpServerId);
    if (!preset || !preset.configSchema || !editingMcpServerId) return;

    try {
      setSavingMcpConfig(true);
      const args = [...preset.baseArgs];
      const env: Record<string, string> = {};

      Object.entries(preset.argsMapping || {}).forEach(([key, mapping]) => {
        const value = mcpUserConfig[key];
        if (mapping.type === "spread" && Array.isArray(value)) {
          const pos = mapping.position ?? 0;
          args.splice(pos, 0, ...value.filter(Boolean));
        } else if (
          mapping.type === "single" &&
          mapping.position !== undefined &&
          typeof value === "string"
        ) {
          args[mapping.position] = value;
        } else if (
          mapping.type === "env" &&
          mapping.key &&
          typeof value === "string"
        ) {
          env[mapping.key] = value;
        }
      });

      const serverConfig = {
        command: preset.command,
        args,
        ...(Object.keys(env).length > 0 ? { env } : {}),
      };
      const newConfig = await addMcpServer(editingMcpServerId, serverConfig);
      const statuses = await getClientsStatus();
      setMcpConfig(newConfig);
      setMcpStatuses(statuses);
      setEditingMcpServerId(undefined);
      setMcpUserConfig({});
      showToast(Locale.Discovery.Status.Enabled);
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Failed to save MCP config",
      );
    } finally {
      setSavingMcpConfig(false);
    }
  };

  const handleCapabilityAction = (item: Capability) => {
    if (item.type === "mcp" && item.presetServer) {
      if (item.installed) {
        setViewingMcpCapability(item);
        return;
      }

      if (item.presetServer.configurable) {
        setEditingMcpServerId(item.presetServer.id);
        setMcpUserConfig({});
        return;
      }

      const enableMcp = async () => {
        try {
          const serverConfig = {
            command: item.presetServer!.command,
            args: [...item.presetServer!.baseArgs],
          };
          const newConfig = await addMcpServer(
            item.presetServer!.id,
            serverConfig,
          );
          const statuses = await getClientsStatus();
          setMcpConfig(newConfig);
          setMcpStatuses(statuses);
          showToast(Locale.Discovery.Status.Enabled);
        } catch (error) {
          showToast(
            error instanceof Error ? error.message : "Failed to enable MCP",
          );
        }
      };

      void enableMcp();
      return;
    }

    if (item.type === "skill" && item.skillPackage && item.skillPackageLang) {
      const skill = skillPackageToSkill(
        item.skillPackage,
        item.skillPackageLang,
        modelConfig,
      );
      skill.packageId = item.skillPackage.id;
      const installedSkill = useSkillStore.getState().create(skill);

      if (item.runtimeStatus === "ready") {
        startSkill(installedSkill);
      } else if (hasSkillMcpRuntimeIssue(item.runtimeResult)) {
        navigate(Path.McpMarket);
      } else {
        openSkillConfig(installedSkill);
      }
      return;
    }

    if (item.type === "skill" && item.skill) {
      const enabledSkill = item.installed
        ? item.skill
        : enableSkill(item.skill);
      if (item.runtimeStatus !== "ready") {
        if (hasSkillMcpRuntimeIssue(item.runtimeResult)) {
          navigate(Path.McpMarket);
          return;
        }
        openSkillConfig(enabledSkill);
        return;
      }
      startSkill(enabledSkill);
      return;
    }
    navigate(item.path);
  };

  const openSkillConfig = (skill: Skill) => {
    if (!skill.builtin) {
      setEditingSkillId(String(skill.id));
      return;
    }

    setEditingSkillId(String(enableSkill(skill).id));
  };

  const getActionText = (item: Capability) => {
    if (item.type === "skill") {
      if (item.skillPackage && !item.installed) return Locale.Discovery.Install;
      if (!item.installed) return Locale.Discovery.Enable;
      return item.runtimeStatus === "ready"
        ? Locale.Discovery.Use
        : Locale.Discovery.Manage;
    }
    if (item.type === "mcp") {
      if (!item.installed && item.presetServer?.configurable) {
        return Locale.Discovery.ConfigureAndEnable;
      }
      if (view === "market" && !item.installed) return Locale.Discovery.Enable;
      return Locale.Discovery.Manage;
    }
    if (view === "market" && !item.installed) return Locale.Discovery.Enable;
    return Locale.Discovery.Manage;
  };

  return (
    <ErrorBoundary>
      <div className={styles["discovery-page"]}>
        <div className="window-header">
          <div className="window-header-title">
            <div className="window-header-main-title">
              {Locale.Discovery.Page.Title}
            </div>
            <div className="window-header-submai-title">
              {Locale.Discovery.Page.SubTitle}
            </div>
          </div>
          <div className="window-actions">
            <div className="window-action-button">
              <IconButton
                text={
                  view === "market"
                    ? Locale.Discovery.MyCapabilities
                    : Locale.Discovery.BackToMarket
                }
                bordered
                onClick={() =>
                  navigate(
                    getDiscoveryPath(
                      view === "market" ? "mine" : "market",
                      activeType,
                    ),
                  )
                }
              />
            </div>
            <div className="window-action-button">
              <IconButton
                icon={<CloseIcon />}
                bordered
                onClick={() => navigate(-1)}
              />
            </div>
          </div>
        </div>

        <div className={styles["discovery-body"]}>
          <div className={styles.toolbar}>
            <input
              className={styles.search}
              value={searchText}
              placeholder={
                view === "market"
                  ? Locale.Discovery.SearchMarket
                  : Locale.Discovery.SearchMine
              }
              onChange={(event) => setSearchText(event.currentTarget.value)}
            />
            <div className={styles.filters}>
              {typeOrder.map((type) => (
                <button
                  key={type}
                  type="button"
                  className={clsx(
                    styles.filter,
                    activeType === type && styles["filter-active"],
                  )}
                  onClick={() => navigate(getDiscoveryPath(view, type))}
                >
                  {Locale.Discovery.Types[type]}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.grid}>
            {visibleCapabilities.map((item) => (
              <div key={item.id} className={styles.card}>
                <div className={styles["card-header"]}>
                  <div className={styles["card-title"]}>
                    <span className={styles["type-icon"]} aria-hidden>
                      {getCapabilityIcon(item.type)}
                    </span>
                    <span>{item.title}</span>
                  </div>
                  <span className={styles.badge}>{item.status}</span>
                </div>
                <div className={styles["card-desc"]}>{item.description}</div>
                <div className={styles.badges}>
                  <span className={styles.badge}>
                    {Locale.Discovery.Runtime[item.runtime]}
                  </span>
                  <span
                    className={clsx(
                      styles.badge,
                      item.pricing !== "free" && styles["badge-paid"],
                    )}
                  >
                    {Locale.Discovery.Pricing[item.pricing]}
                  </span>
                </div>
                <div className={styles.meta}>
                  <span>
                    {Locale.Discovery.SourceLabel}: {item.source}
                  </span>
                </div>
                <div className={styles.actions}>
                  <IconButton
                    icon={<EyeIcon />}
                    text={getActionText(item)}
                    bordered
                    onClick={() => handleCapabilityAction(item)}
                  />
                  {item.type === "skill" && item.skill && (
                    <IconButton
                      icon={<EditIcon />}
                      text={Locale.Discovery.Configure}
                      bordered
                      onClick={() => openSkillConfig(item.skill!)}
                    />
                  )}
                </div>
              </div>
            ))}
            {visibleCapabilities.length === 0 && (
              <div className={styles.empty}>
                <div>{Locale.Discovery.Empty}</div>
                {(searchText || activeType !== "all") && (
                  <button
                    type="button"
                    className={styles["empty-action"]}
                    onClick={() => {
                      setSearchText("");
                      navigate(getDiscoveryPath(view, "all"));
                    }}
                  >
                    {Locale.Discovery.ResetFilters}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
        {editingMcpServerId && (
          <div className="modal-mask">
            <Modal
              title={`Configure MCP - ${editingMcpServerId}`}
              onClose={() =>
                !savingMcpConfig && setEditingMcpServerId(undefined)
              }
              actions={[
                <IconButton
                  key="cancel"
                  text="Cancel"
                  bordered
                  disabled={savingMcpConfig}
                  onClick={() => {
                    setEditingMcpServerId(undefined);
                    setMcpUserConfig({});
                  }}
                />,
                <IconButton
                  key="save"
                  text="Save"
                  type="primary"
                  bordered
                  disabled={savingMcpConfig}
                  onClick={saveMcpServerConfig}
                />,
              ]}
            >
              <List>{renderMcpConfigForm()}</List>
            </Modal>
          </div>
        )}
        {editingSkill && (
          <div className="modal-mask">
            <Modal
              title={Locale.Mask.EditModal.Title(editingSkill.builtin)}
              onClose={() => setEditingSkillId(undefined)}
            >
              <SkillConfig
                mask={editingSkill}
                updateMask={(updater) =>
                  skillStore.updateMask(editingSkill.id, updater)
                }
                readonly={editingSkill.builtin}
              />
            </Modal>
          </div>
        )}
        {viewingMcpCapability && (
          <div className="modal-mask">
            <Modal
              title={viewingMcpCapability.title}
              onClose={() => setViewingMcpCapability(undefined)}
              actions={[
                <IconButton
                  key="close"
                  text={Locale.UI.Close}
                  bordered
                  onClick={() => setViewingMcpCapability(undefined)}
                />,
                <IconButton
                  key="manager"
                  text={Locale.Discovery.OpenMcpManager}
                  type="primary"
                  bordered
                  onClick={() => {
                    setViewingMcpCapability(undefined);
                    navigate(Path.McpMarket);
                  }}
                />,
              ]}
            >
              <div className={styles["mcp-detail"]}>
                <div className={styles["mcp-detail-row"]}>
                  <span>{Locale.Discovery.McpStatus}</span>
                  <strong>{viewingMcpCapability.status}</strong>
                </div>
                <div className={styles["mcp-detail-row"]}>
                  <span>{Locale.Discovery.SourceLabel}</span>
                  <strong>{viewingMcpCapability.source}</strong>
                </div>
                <div className={styles["mcp-detail-desc"]}>
                  {viewingMcpCapability.description}
                </div>
                {viewingMcpCapability.presetServer?.repo && (
                  <a
                    href={viewingMcpCapability.presetServer.repo}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {viewingMcpCapability.presetServer.repo}
                  </a>
                )}
              </div>
            </Modal>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}
