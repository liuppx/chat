import {
  applyDeepSeekReasoning,
  applyMessagesReasoning,
  applyOpenAICompatibleReasoning,
  applyOpenAIReasoning,
  applyQwenReasoning,
} from "../app/client/reasoning";
import { ServiceProvider } from "../app/constant";

describe("reasoning request helpers", () => {
  test("disables DeepSeek thinking for ordinary reasoning-capable chat", () => {
    const payload: Record<string, any> = {
      model: "deepseek-v4-pro",
      temperature: 0.5,
      top_p: 1,
      presence_penalty: 0,
      frequency_penalty: 0,
    };

    applyDeepSeekReasoning(payload, {
      model: "deepseek-v4-pro",
      providerName: ServiceProvider.DeepSeek,
      tags: ["reasoning"],
      reasoningMode: "off",
    });

    expect(payload.thinking).toEqual({ type: "disabled" });
    expect(payload.temperature).toBe(0.5);
    expect(payload.top_p).toBe(1);
  });

  test("enables DeepSeek thinking and removes unsupported sampling parameters", () => {
    const payload: Record<string, any> = {
      model: "deepseek-v4-pro",
      temperature: 0.5,
      top_p: 1,
      presence_penalty: 0,
      frequency_penalty: 0,
    };

    applyDeepSeekReasoning(payload, {
      model: "deepseek-v4-pro",
      providerName: ServiceProvider.DeepSeek,
      tags: ["reasoning"],
      reasoningMode: "on",
      reasoningEffort: "high",
    });

    expect(payload.thinking).toEqual({ type: "enabled" });
    expect(payload.temperature).toBeUndefined();
    expect(payload.top_p).toBeUndefined();
    expect(payload.presence_penalty).toBeUndefined();
    expect(payload.frequency_penalty).toBeUndefined();
  });

  test("uses OpenAI reasoning field for OpenAI models", () => {
    const payload: Record<string, any> = { model: "gpt-5.4" };

    applyOpenAIReasoning(payload, {
      model: "gpt-5.4",
      providerName: ServiceProvider.OpenAI,
      tags: ["reasoning"],
      reasoningMode: "on",
      reasoningEffort: "high",
    });

    expect(payload.reasoning).toEqual({ effort: "high" });
  });

  test("uses Qwen enable_thinking field for Qwen models", () => {
    const parameters: Record<string, any> = {};

    applyQwenReasoning(parameters, {
      model: "qwen3.7-plus",
      providerName: ServiceProvider.Alibaba,
      tags: ["reasoning"],
      reasoningMode: "on",
    });

    expect(parameters.enable_thinking).toBe(true);
  });

  test("uses DeepSeek thinking when OpenAI client targets a DeepSeek router model", () => {
    const payload: Record<string, any> = {
      model: "deepseek-v4-flash",
      temperature: 0.5,
    };

    applyOpenAICompatibleReasoning(payload, {
      model: "deepseek-v4-flash",
      providerName: ServiceProvider.OpenAI,
      ownedBy: "deepseek",
      tags: ["reasoning"],
      reasoningMode: "off",
    });

    expect(payload.thinking).toEqual({ type: "disabled" });
    expect(payload.reasoning).toBeUndefined();
  });

  test("uses DeepSeek thinking when messages client targets a DeepSeek router model", () => {
    const payload: Record<string, any> = {
      model: "deepseek-v4-flash",
      temperature: 0.5,
    };

    applyMessagesReasoning(payload, {
      model: "deepseek-v4-flash",
      providerName: ServiceProvider.Anthropic,
      ownedBy: "deepseek",
      tags: ["reasoning"],
      reasoningMode: "off",
    });

    expect(payload.thinking).toEqual({ type: "disabled" });
  });
});
