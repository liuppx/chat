import { BuiltinSkill } from "./typing";
import { CHAT_TOOLBAR_PRESETS, createBuiltinSkill } from "./utils";
import { ServiceProvider } from "../constant";
import {
  DEFAULT_ROUTER_REALTIME_MODEL,
  DEFAULT_ROUTER_REALTIME_VOICE,
  REALTIME_ROUTER_PROVIDER,
} from "../store/realtime";

export const CN_SKILLS: BuiltinSkill[] = [
  createBuiltinSkill({
    avatar: "26a1",
    name: "通用问答",
    description: "没有固定套路，适合日常问答、临时想法和快速处理。",
    category: "基础",
    starters: [
      "帮我把这个问题想清楚，先给结论。",
      "把下面内容整理成清晰的要点。",
      "按当前信息先推进，缺少关键信息再问我。",
    ],
    lang: "cn",
    createdAt: 1700000001001,
    ui: {
      sessionToolbar: CHAT_TOOLBAR_PRESETS.general,
    },
    context: [
      {
        id: "cn-general-0",
        role: "system",
        content:
          "你是一个面向结果的通用 AI。先理解用户目标，再给出清晰、可执行的回答。信息不足时，只追问最关键的问题；如果可以基于合理假设继续，就先说明假设并推进。避免空话和重复，优先输出结论、步骤、风险和下一步。",
        date: "",
      },
    ],
    modelConfig: {
      temperature: 0.4,
      historyMessageCount: 12,
    },
  }),
  createBuiltinSkill({
    avatar: "1f9e0",
    name: "深度思考",
    description:
      "启用支持推理模型的深度思考能力，适合复杂分析、规划和高难度问题。",
    category: "分析",
    starters: [
      "深入分析这个问题，先拆解关键变量，再给结论。",
      "请用更强推理模式解决这个复杂任务。",
      "帮我做一次系统性推演，列出假设、推理过程和风险。",
    ],
    lang: "cn",
    createdAt: 1700000001006,
    syncGlobalConfig: false,
    candidateModels: [{ capability: "reasoning" }],
    toolStrategy: {
      nativeToolBridge: "auto",
    },
    ui: {
      sessionToolbar: CHAT_TOOLBAR_PRESETS.reasoning,
    },
    context: [
      {
        id: "cn-deep-reasoning-0",
        role: "system",
        content:
          "你正在执行深度思考任务。先识别问题类型和关键约束，再进行结构化分析。输出时区分事实、假设、推理和结论；复杂问题需要给出取舍、风险和下一步验证。不要为了显得复杂而拉长回答，重点保证推理链条清晰、结论可执行。",
        date: "",
      },
    ],
    modelConfig: {
      reasoningMode: "on",
      reasoningEffort: "high",
      temperature: 0.2,
      max_tokens: 8000,
      historyMessageCount: 12,
    },
  }),
  createBuiltinSkill({
    avatar: "1f5bc-fe0f",
    name: "AI绘画",
    description: "围绕画面创意、提示词和生成参数来组织一次图片创作会话。",
    category: "创作",
    starters: [
      "给我生成一张海报风格的封面，先补全高质量提示词。",
      "把这个产品想法转成适合图片模型的生成提示词。",
      "先给我 3 个不同画风方向，再按我选的方向继续生成。",
    ],
    lang: "cn",
    createdAt: 1700000001005,
    syncGlobalConfig: false,
    launch: { type: "sd" },
    ui: {
      sessionToolbar: CHAT_TOOLBAR_PRESETS.image,
    },
    context: [
      {
        id: "cn-image-0",
        role: "system",
        content:
          "你是图片创作助手。根据用户目标生成清晰、可执行的画面提示词，必要时补充风格、构图、光线、材质、文字和负面约束。回答保持简洁，优先服务于下一次图片生成。",
        date: "",
      },
    ],
    modelConfig: {
      model: "gpt-image-1",
      providerName: ServiceProvider.OpenAI,
      temperature: 0.7,
      historyMessageCount: 6,
      size: "1024x1024",
      quality: "auto",
      style: "vivid",
    },
  }),
  createBuiltinSkill({
    avatar: "1f3a7",
    name: "实时聊天",
    description: "使用实时语音对话能力，适合语音交流、即时反馈和口语互动。",
    category: "语音",
    starters: [
      "开始一次实时语音聊天。",
      "我想用语音和你讨论一个问题。",
      "开启实时对话，边说边聊。",
    ],
    lang: "cn",
    createdAt: 1700000001007,
    syncGlobalConfig: false,
    ui: {
      sessionToolbar: CHAT_TOOLBAR_PRESETS.realtime,
    },
    context: [
      {
        id: "cn-realtime-0",
        role: "system",
        content:
          "你正在进行实时语音聊天。回答要自然、简洁，适合口语交流；用户停顿或表达不完整时，优先确认意图并继续推进。",
        date: "",
      },
    ],
    modelConfig: {
      temperature: 0.5,
      historyMessageCount: 6,
    },
    realtimeConfig: {
      enabled: false,
      provider: REALTIME_ROUTER_PROVIDER,
      model: DEFAULT_ROUTER_REALTIME_MODEL,
      voice: DEFAULT_ROUTER_REALTIME_VOICE,
    },
  }),
];
