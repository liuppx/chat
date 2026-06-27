import {
  getTextModelParameterSpecification,
  hasExplicitTextParameterCatalog,
  isTextModelParameterSupported,
  normalizeTextModelConfigBySpecification,
} from "../app/client/text-model-spec";
import { SupportedTextEndpoint, type ModelSpecification } from "../app/client/api";

describe("text model specification helpers", () => {
  const specification: ModelSpecification = {
    version: 1,
    endpoints: {
      [SupportedTextEndpoint.Responses]: {
        parameters: {
          temperature: { min: 0.2, max: 0.8 },
          max_output_tokens: { min: 256, max: 2048 },
        },
      },
    },
  };

  test("reads parameter specs from router responses endpoint metadata", () => {
    expect(
      getTextModelParameterSpecification({
        specification,
        endpointPath: SupportedTextEndpoint.Responses,
        key: "temperature",
      }),
    ).toEqual({ min: 0.2, max: 0.8 });

    expect(
      getTextModelParameterSpecification({
        specification,
        endpointPath: SupportedTextEndpoint.Responses,
        key: "max_tokens",
      }),
    ).toEqual({ min: 256, max: 2048 });
  });

  test("hides unsupported params when router provides an explicit text parameter catalog", () => {
    expect(
      hasExplicitTextParameterCatalog({
        specification,
        endpointPath: SupportedTextEndpoint.Responses,
      }),
    ).toBe(true);

    expect(
      isTextModelParameterSupported({
        specification,
        endpointPath: SupportedTextEndpoint.Responses,
        key: "top_p",
      }),
    ).toBe(false);
  });

  test("clamps and prunes config values by router text specification", () => {
    expect(
      normalizeTextModelConfigBySpecification(
        {
          temperature: 1.2,
          top_p: 0.9,
          max_tokens: 4096,
          presence_penalty: 0.4,
          frequency_penalty: 0.3,
        },
        {
          specification,
          endpointPath: SupportedTextEndpoint.Responses,
        },
      ),
    ).toEqual({
      temperature: 0.8,
      max_tokens: 2048,
    });
  });

  test("keeps config unchanged when router does not provide a text parameter catalog", () => {
    expect(
      normalizeTextModelConfigBySpecification(
        {
          temperature: 1.2,
          top_p: 0.9,
          max_tokens: 4096,
          presence_penalty: 0.4,
          frequency_penalty: 0.3,
        },
        {
          specification: {
            version: 1,
            endpoints: {
              [SupportedTextEndpoint.Responses]: {},
            },
          },
          endpointPath: SupportedTextEndpoint.Responses,
        },
      ),
    ).toEqual({
      temperature: 1.2,
      top_p: 0.9,
      max_tokens: 4096,
      presence_penalty: 0.4,
      frequency_penalty: 0.3,
    });
  });
});
