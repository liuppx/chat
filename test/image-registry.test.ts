import { resolveImageModels } from "../app/components/sd/image-registry";
import {
  SupportedEndpoint,
  type LLMModel,
  type ModelSpecification,
} from "../app/client/api";
import { ServiceProvider } from "../app/constant";

describe("image registry", () => {
  const specification: ModelSpecification = {
    version: 1,
    endpoints: {
      [SupportedEndpoint.ImagesGenerations]: {
        parameters: {
          quality: { allowed_values: ["auto", "high"] },
        },
      },
    },
  };

  test("uses router runtime models with image tag and image endpoint only", () => {
    const models = resolveImageModels([
      {
        name: "qwen-image",
        displayName: "Qwen Image",
        available: true,
        sorted: 1,
        tags: ["image"],
        specification,
        supportedEndpoints: [SupportedEndpoint.ImagesGenerations],
        provider: {
          id: "qwen",
          providerName: ServiceProvider.OpenAI,
          providerType: "qwen",
          sorted: 1,
        },
      } as LLMModel,
      {
        name: "text-only",
        available: true,
        sorted: 2,
        tags: ["reasoning"],
        supportedEndpoints: [SupportedEndpoint.ImagesGenerations],
        provider: {
          id: "qwen",
          providerName: ServiceProvider.OpenAI,
          providerType: "qwen",
          sorted: 1,
        },
      } as LLMModel,
      {
        name: "no-image-endpoint",
        available: true,
        sorted: 3,
        tags: ["image"],
        supportedEndpoints: ["/v1/chat/completions"],
        provider: {
          id: "qwen",
          providerName: ServiceProvider.OpenAI,
          providerType: "qwen",
          sorted: 1,
        },
      } as LLMModel,
    ]);

    expect(models).toHaveLength(1);
    expect(models[0].value).toBe("qwen-image");
    expect(models[0].specification).toEqual(specification);
  });
});
