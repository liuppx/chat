import type { ResolvedImageResult } from "./image-endpoint-schema-utils";

export function resolveStoredImageUrl(
  imageResult: ResolvedImageResult,
  options: {
    base64Image2Blob: (base64Data: string, contentType: string) => Blob;
    uploadGeneratedImageAndGetStableUrl: (file: Blob) => Promise<string>;
  },
) {
  if (imageResult.type === "url") {
    return Promise.resolve(imageResult.value);
  }

  return options.uploadGeneratedImageAndGetStableUrl(
    options.base64Image2Blob(imageResult.value, "image/png"),
  );
}
