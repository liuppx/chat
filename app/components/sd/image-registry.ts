import { LLMModel, supportsImageGenerationEndpoint } from "@/app/client/api";
import Locale from "@/app/locales";

export type ImageEndpointType = "stability" | "openai-image";

export type ImageParamOption = {
  name: string;
  value: string;
};

export type ImageParamSchema = {
  name: string;
  value: string;
  type: "text" | "textarea" | "select" | "number";
  placeholder?: string;
  required?: boolean;
  default?: any;
  options?: ImageParamOption[];
  min?: number;
  max?: number;
  sub?: string;
};

export type ImageModelDefinition = {
  name: string;
  value: string;
  provider: string;
  providerName: string;
  endpointType: ImageEndpointType;
  supportsImage: true;
  params: (data: any) => ImageParamSchema[];
};

const promptParam: ImageParamSchema = {
  name: Locale.SdPanel.Prompt,
  value: "prompt",
  type: "textarea",
  placeholder: Locale.SdPanel.PleaseInput(Locale.SdPanel.Prompt),
  required: true,
};

const negativePromptParam: ImageParamSchema = {
  name: Locale.SdPanel.NegativePrompt,
  value: "negative_prompt",
  type: "textarea",
  placeholder: Locale.SdPanel.PleaseInput(Locale.SdPanel.NegativePrompt),
};

const sdAspectRatioParam: ImageParamSchema = {
  name: Locale.SdPanel.AspectRatio,
  value: "aspect_ratio",
  type: "select",
  default: "1:1",
  options: [
    { name: "1:1", value: "1:1" },
    { name: "16:9", value: "16:9" },
    { name: "21:9", value: "21:9" },
    { name: "2:3", value: "2:3" },
    { name: "3:2", value: "3:2" },
    { name: "4:5", value: "4:5" },
    { name: "5:4", value: "5:4" },
    { name: "9:16", value: "9:16" },
    { name: "9:21", value: "9:21" },
  ],
};

const sdModelVersionParam: ImageParamSchema = {
  name: Locale.SdPanel.ModelVersion,
  value: "model",
  type: "select",
  default: "sd3-medium",
  options: [
    { name: "SD3 Medium", value: "sd3-medium" },
    { name: "SD3 Large", value: "sd3-large" },
    { name: "SD3 Large Turbo", value: "sd3-large-turbo" },
  ],
};

const sdStyleParam: ImageParamSchema = {
  name: Locale.SdPanel.ImageStyle,
  value: "style",
  type: "select",
  default: "3d-model",
  options: [
    { name: Locale.SdPanel.Styles.D3Model, value: "3d-model" },
    { name: Locale.SdPanel.Styles.AnalogFilm, value: "analog-film" },
    { name: Locale.SdPanel.Styles.Anime, value: "anime" },
    { name: Locale.SdPanel.Styles.Cinematic, value: "cinematic" },
    { name: Locale.SdPanel.Styles.ComicBook, value: "comic-book" },
    { name: Locale.SdPanel.Styles.DigitalArt, value: "digital-art" },
    { name: Locale.SdPanel.Styles.Enhance, value: "enhance" },
    { name: Locale.SdPanel.Styles.FantasyArt, value: "fantasy-art" },
    { name: Locale.SdPanel.Styles.Isometric, value: "isometric" },
    { name: Locale.SdPanel.Styles.LineArt, value: "line-art" },
    { name: Locale.SdPanel.Styles.LowPoly, value: "low-poly" },
    {
      name: Locale.SdPanel.Styles.ModelingCompound,
      value: "modeling-compound",
    },
    { name: Locale.SdPanel.Styles.NeonPunk, value: "neon-punk" },
    { name: Locale.SdPanel.Styles.Origami, value: "origami" },
    { name: Locale.SdPanel.Styles.Photographic, value: "photographic" },
    { name: Locale.SdPanel.Styles.PixelArt, value: "pixel-art" },
    { name: Locale.SdPanel.Styles.TileTexture, value: "tile-texture" },
  ],
};

const seedParam: ImageParamSchema = {
  name: "Seed",
  value: "seed",
  type: "number",
  default: 0,
  min: 0,
  max: 4294967294,
};

const outputFormatParam: ImageParamSchema = {
  name: Locale.SdPanel.OutFormat,
  value: "output_format",
  type: "select",
  default: "png",
  options: [
    { name: "PNG", value: "png" },
    { name: "JPEG", value: "jpeg" },
    { name: "WebP", value: "webp" },
  ],
};

const imageSizeParam: ImageParamSchema = {
  name: Locale.SdPanel.ImageSize,
  value: "size",
  type: "select",
  default: "1024x1024",
  options: [
    { name: "1024x1024", value: "1024x1024" },
    { name: "1792x1024", value: "1792x1024" },
    { name: "1024x1792", value: "1024x1792" },
  ],
};

const dalleQualityParam: ImageParamSchema = {
  name: Locale.SdPanel.ImageQuality,
  value: "quality",
  type: "select",
  default: "standard",
  options: [
    { name: "standard", value: "standard" },
    { name: "hd", value: "hd" },
  ],
};

const dalleStyleParam: ImageParamSchema = {
  name: Locale.SdPanel.ImageStyle,
  value: "style",
  type: "select",
  default: "vivid",
  options: [
    { name: "vivid", value: "vivid" },
    { name: "natural", value: "natural" },
  ],
};

const commonStabilityParams = () => [
  promptParam,
  negativePromptParam,
  sdAspectRatioParam,
  seedParam,
  outputFormatParam,
];

export const imageModels: ImageModelDefinition[] = [
  {
    name: "Stable Image Ultra",
    value: "ultra",
    provider: "stability",
    providerName: "Stability",
    endpointType: "stability",
    supportsImage: true,
    params: () => commonStabilityParams(),
  },
  {
    name: "Stable Image Core",
    value: "core",
    provider: "stability",
    providerName: "Stability",
    endpointType: "stability",
    supportsImage: true,
    params: () => [
      promptParam,
      negativePromptParam,
      sdAspectRatioParam,
      sdStyleParam,
      seedParam,
      outputFormatParam,
    ],
  },
  {
    name: "Stable Diffusion 3",
    value: "sd3",
    provider: "stability",
    providerName: "Stability",
    endpointType: "stability",
    supportsImage: true,
    params: (data: any) =>
      [
        promptParam,
        sdModelVersionParam,
        negativePromptParam,
        sdAspectRatioParam,
        seedParam,
        outputFormatParam,
      ].filter(
        (item) =>
          !(
            data.model === "sd3-large-turbo" && item.value === "negative_prompt"
          ),
      ),
  },
];

export function getImageModels() {
  return imageModels.filter((item) => item.supportsImage);
}

export function getDefaultImageModel() {
  return getImageModels()[0];
}

export function getImageModelByValue(
  model: string,
  sourceModels?: readonly ImageModelDefinition[],
) {
  const models = sourceModels ?? getImageModels();
  return models.find((item) => item.value === model);
}

function isDalleLikeModel(modelName: string) {
  return modelName.trim().toLowerCase() === "dall-e-3";
}

function buildParamsForRuntimeModel(modelName: string) {
  if (isDalleLikeModel(modelName)) {
    return [promptParam, imageSizeParam, dalleQualityParam, dalleStyleParam];
  }

  return [promptParam, imageSizeParam];
}

function buildRuntimeImageModel(model: LLMModel): ImageModelDefinition | null {
  const tags = model.tags ?? [];
  const endpoints = model.supportedEndpoints ?? [];
  if (!tags.includes("image")) return null;
  if (!supportsImageGenerationEndpoint(endpoints)) return null;

  const providerName =
    model.provider?.providerName || model.ownedBy || model.provider?.id || "";
  const providerId =
    model.provider?.id || providerName.trim().toLowerCase() || "router";

  return {
    name: model.displayName || model.name,
    value: model.name,
    provider: providerId,
    providerName,
    endpointType: "openai-image",
    supportsImage: true,
    params: () => buildParamsForRuntimeModel(model.name),
  };
}

export function resolveImageModels(runtimeModels?: readonly LLMModel[]) {
  const finalModels = new Map<string, ImageModelDefinition>();

  (runtimeModels ?? [])
    .map((model) => buildRuntimeImageModel(model))
    .filter((model): model is ImageModelDefinition => !!model)
    .forEach((model) => {
      finalModels.set(model.value, model);
    });

  getImageModels().forEach((model) => {
    if (!finalModels.has(model.value)) {
      finalModels.set(model.value, model);
    }
  });

  return Array.from(finalModels.values());
}

export function getModelParams(
  model: string,
  data: any,
  sourceModels?: readonly ImageModelDefinition[],
) {
  return getImageModelByValue(model, sourceModels)?.params(data) || [];
}

export function getParamLabel(value: string) {
  switch (value) {
    case "prompt":
      return Locale.SdPanel.Prompt;
    case "negative_prompt":
      return Locale.SdPanel.NegativePrompt;
    case "aspect_ratio":
      return Locale.SdPanel.AspectRatio;
    case "size":
      return Locale.SdPanel.ImageSize;
    case "quality":
      return Locale.SdPanel.ImageQuality;
    case "style":
      return Locale.SdPanel.ImageStyle;
    case "seed":
      return "Seed";
    case "output_format":
      return Locale.SdPanel.OutFormat;
    case "model":
      return Locale.SdPanel.ModelVersion;
    default:
      return value;
  }
}

export function getParamDisplayValue(
  model: string,
  key: string,
  value: any,
  params: Record<string, any>,
) {
  if (key === "seed") return value || 0;
  if (key === "output_format") return value?.toUpperCase();

  const columns = getModelParams(model, params);
  const option = columns
    .find((item) => item.value === key)
    ?.options?.find((item) => item.value === value);

  return option?.name ?? value;
}
