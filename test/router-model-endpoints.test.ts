import {
  normalizeRouterRuntimeSupportedEndpoints,
} from "../app/client/platforms/router";
import {
  SupportedEndpoint,
  SupportedTextEndpoint,
} from "../app/client/endpoints";

describe("router runtime model endpoints", () => {
  test("treats unannotated router runtime models as unavailable", () => {
    expect(
      normalizeRouterRuntimeSupportedEndpoints({
        supported_endpoints: undefined,
      }),
    ).toEqual([]);
  });

  test("keeps explicit router endpoints", () => {
    expect(
      normalizeRouterRuntimeSupportedEndpoints({
        supported_endpoints: [SupportedTextEndpoint.Responses],
      }),
    ).toEqual([SupportedTextEndpoint.Responses]);
  });

  test("does not infer endpoints for image-only models", () => {
    expect(
      normalizeRouterRuntimeSupportedEndpoints({
        supported_endpoints: undefined,
      }),
    ).toEqual([]);
  });

  test("keeps explicit image endpoints", () => {
    expect(
      normalizeRouterRuntimeSupportedEndpoints({
        supported_endpoints: [SupportedEndpoint.ImagesGenerations],
      }),
    ).toEqual([SupportedEndpoint.ImagesGenerations]);
  });
});
