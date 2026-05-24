import type { ImageEndpointSchema } from "./image-endpoint-schemas";

export type ResolvedImageResult = NonNullable<
  ReturnType<ImageEndpointSchema["resolveImageResult"]>
>;

export function buildOpenAIImageEditFormData(data: {
  model: string;
  params: Record<string, any>;
  sourceImage?: Blob;
  maskImage?: Blob;
}) {
  const body = new FormData();
  body.append("model", data.model);
  body.append("prompt", data.params.prompt || "");
  body.append("size", data.params.size || "1024x1024");
  body.append("quality", data.params.quality || "standard");
  body.append("style", data.params.style || "vivid");
  if (data.sourceImage) {
    body.append("image", data.sourceImage, "image.png");
  }
  if (data.maskImage) {
    body.append("mask", data.maskImage, "mask.png");
  }
  return body;
}

export function resolveOpenAIImageResult(
  response: any,
): ResolvedImageResult | undefined {
  const b64Json = response?.data?.[0]?.b64_json;
  if (typeof b64Json === "string" && b64Json) {
    return {
      type: "b64_json",
      value: b64Json,
    };
  }

  const url = response?.data?.[0]?.url;
  if (typeof url === "string" && url) {
    return {
      type: "url",
      value: url,
    };
  }

  return undefined;
}
