import { LLMModel } from "../app/client/api";
import { ServiceProvider } from "../app/constant";
import { filterModelsByCandidates } from "../app/utils/model";

function createModel(
  name: string,
  providerName: ServiceProvider,
  overrides: Partial<LLMModel> = {},
): LLMModel {
  return {
    name,
    displayName: name,
    available: true,
    sorted: 0,
    provider: {
      id: providerName,
      providerName,
      providerType: providerName,
      sorted: 0,
    },
    ...overrides,
  };
}

describe("reasoning model candidates", () => {
  test("filters ordinary models out of reasoning skills", () => {
    const models = [
      createModel("gpt-4o-mini", ServiceProvider.OpenAI),
      createModel("claude-sonnet-4-20250514", ServiceProvider.Anthropic, {
        tags: ["reasoning"],
      }),
    ];

    expect(
      filterModelsByCandidates(models, [{ capability: "reasoning" }]).map(
        (model) => model.name,
      ),
    ).toEqual(["claude-sonnet-4-20250514"]);
  });

  test("returns no models when a reasoning skill has no reasoning-capable model", () => {
    const models = [createModel("gpt-4o-mini", ServiceProvider.OpenAI)];

    expect(
      filterModelsByCandidates(models, [{ capability: "reasoning" }]),
    ).toEqual([]);
  });
});
