import { jest } from "@jest/globals";

import { resolveStoredImageUrl } from "../app/components/sd/image-result";

describe("resolveStoredImageUrl", () => {
  test("returns direct url responses without re-uploading", async () => {
    const uploadGeneratedImageAndGetStableUrl =
      jest.fn<(file: Blob) => Promise<string>>();
    const base64Image2Blob =
      jest.fn<(base64Data: string, contentType: string) => Blob>();

    await expect(
      resolveStoredImageUrl(
        {
          type: "url",
          value: "https://example.com/generated.png",
        },
        {
          base64Image2Blob,
          uploadGeneratedImageAndGetStableUrl,
        },
      ),
    ).resolves.toBe("https://example.com/generated.png");

    expect(base64Image2Blob).not.toHaveBeenCalled();
    expect(uploadGeneratedImageAndGetStableUrl).not.toHaveBeenCalled();
  });

  test("uploads b64_json responses to stable storage", async () => {
    const blob = new Blob(["decoded"], { type: "image/png" });
    const uploadGeneratedImageAndGetStableUrl = jest
      .fn<(file: Blob) => Promise<string>>()
      .mockResolvedValue("https://stable.example.com/generated.png");
    const base64Image2Blob = jest
      .fn<(base64Data: string, contentType: string) => Blob>()
      .mockReturnValue(blob);

    await expect(
      resolveStoredImageUrl(
        {
          type: "b64_json",
          value: "base64-image",
        },
        {
          base64Image2Blob,
          uploadGeneratedImageAndGetStableUrl,
        },
      ),
    ).resolves.toBe("https://stable.example.com/generated.png");

    expect(base64Image2Blob).toHaveBeenCalledWith("base64-image", "image/png");
    expect(uploadGeneratedImageAndGetStableUrl).toHaveBeenCalledWith(blob);
  });
});
