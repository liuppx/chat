import {
  selectPreferredRequestEndpoint,
  selectPreferredTextEndpoint,
  SupportedEndpoint,
  SupportedTextEndpoint,
} from "../app/client/endpoints";

describe("selectPreferredTextEndpoint", () => {
  test("selects messages for non-GPT models when messages is supported", () => {
    const endpoint = selectPreferredTextEndpoint([
      SupportedTextEndpoint.Responses,
      SupportedTextEndpoint.Messages,
      SupportedTextEndpoint.ChatCompletions,
    ]);

    expect(endpoint).toBe(SupportedTextEndpoint.Messages);
  });

  test("requires responses only for responses-only flows", () => {
    const endpoint = selectPreferredTextEndpoint(
      [SupportedTextEndpoint.ChatCompletions, SupportedTextEndpoint.Responses],
      { requireResponses: true },
    );

    expect(endpoint).toBe(SupportedTextEndpoint.Responses);
  });

  test("selects responses for gpt series when responses is supported", () => {
    const endpoint = selectPreferredTextEndpoint(
      [SupportedTextEndpoint.ChatCompletions, SupportedTextEndpoint.Responses],
      { modelName: "gpt-5.4" },
    );

    expect(endpoint).toBe(SupportedTextEndpoint.Responses);
  });

  test("falls back to image generations when only the image endpoint is supported", () => {
    const endpoint = selectPreferredRequestEndpoint([
      SupportedEndpoint.ImagesGenerations,
    ]);

    expect(endpoint).toBe(SupportedEndpoint.ImagesGenerations);
  });
});
