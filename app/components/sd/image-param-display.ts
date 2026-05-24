import Locale from "@/app/locales";
import { getModelParams } from "./image-registry";

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
