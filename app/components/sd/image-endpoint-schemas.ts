import Locale from "@/app/locales";
import {
  buildOpenAIImageEditFormData,
  resolveOpenAIImageResult,
} from "./image-endpoint-schema-utils";

export type ImageEndpointType = "images-generation" | "images-edits";
export type ImageFormMode = "generation" | "editing";

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

export type ImageEndpointSchema = {
  params: (data: any) => ImageParamSchema[];
  buildRequestBody: (data: {
    model: string;
    params: Record<string, any>;
    sourceImage?: Blob;
    maskImage?: Blob;
  }) => Record<string, any> | FormData;
  resolveImageResult: (response: any) =>
    | {
        type: "b64_json";
        value: string;
      }
    | {
        type: "url";
        value: string;
      }
    | undefined;
  resolveErrorMessage: (response: any) => string;
};

const promptParam: ImageParamSchema = {
  name: Locale.SdPanel.Prompt,
  value: "prompt",
  type: "textarea",
  placeholder: Locale.SdPanel.PleaseInput(Locale.SdPanel.Prompt),
  required: true,
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

const imageQualityParam: ImageParamSchema = {
  name: Locale.SdPanel.ImageQuality,
  value: "quality",
  type: "select",
  default: "standard",
  options: [
    { name: "standard", value: "standard" },
    { name: "hd", value: "hd" },
  ],
};

const imageStyleParam: ImageParamSchema = {
  name: Locale.SdPanel.ImageStyle,
  value: "style",
  type: "select",
  default: "vivid",
  options: [
    { name: "vivid", value: "vivid" },
    { name: "natural", value: "natural" },
  ],
};

export const imageEndpointSchemas: Record<
  ImageEndpointType,
  ImageEndpointSchema
> = {
  "images-generation": {
    params: () => [
      promptParam,
      imageSizeParam,
      imageQualityParam,
      imageStyleParam,
    ],
    buildRequestBody: ({ model, params }) => ({
      model,
      prompt: params.prompt,
      response_format: "b64_json",
      n: 1,
      size: params.size || "1024x1024",
      quality: params.quality || "standard",
      style: params.style || "vivid",
    }),
    resolveImageResult: resolveOpenAIImageResult,
    resolveErrorMessage: (response) =>
      response?.error?.message ||
      response?.message ||
      (Array.isArray(response?.errors) ? response.errors[0] : "") ||
      "",
  },
  "images-edits": {
    params: () => [
      promptParam,
      imageSizeParam,
      imageQualityParam,
      imageStyleParam,
    ],
    buildRequestBody: buildOpenAIImageEditFormData,
    resolveImageResult: resolveOpenAIImageResult,
    resolveErrorMessage: (response) =>
      response?.error?.message ||
      response?.message ||
      (Array.isArray(response?.errors) ? response.errors[0] : "") ||
      "",
  },
};

export function getImageEndpointSchema(endpointType: ImageEndpointType) {
  return imageEndpointSchemas[endpointType];
}
