import { appendAnthropicToolRound } from "../app/client/platforms/anthropic";

describe("appendAnthropicToolRound", () => {
  test("appends tool_use and tool_result blocks in a single Anthropic user message", () => {
    const messages: Array<Record<string, any>> = [
      { role: "user", content: "hello" },
    ];

    appendAnthropicToolRound(
      messages,
      {
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: {
              name: "search",
              arguments: '{"q":"code review"}',
            },
          },
          {
            id: "call_2",
            type: "function",
            function: {
              name: "fetch",
              arguments: '{"url":"https://example.com"}',
            },
          },
        ],
      },
      [
        { tool_call_id: "call_1", content: "search result" },
        { tool_call_id: "call_2", content: "fetch result" },
      ],
    );

    expect(messages).toEqual([
      { role: "user", content: "hello" },
      {
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id: "call_1",
            name: "search",
            input: { q: "code review" },
          },
          {
            type: "tool_use",
            id: "call_2",
            name: "fetch",
            input: { url: "https://example.com" },
          },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "call_1",
            content: "search result",
          },
          {
            type: "tool_result",
            tool_use_id: "call_2",
            content: "fetch result",
          },
        ],
      },
    ]);
  });
});
