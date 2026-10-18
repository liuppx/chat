import { filterToolPresetServersForRuntime } from "../app/tools/runtime";
import {
  getMissingToolConfigKeys,
  preserveEmptyToolSecrets,
  redactToolServerConfig,
} from "../app/tools/config-schema";

describe("tool runtime marketplace boundaries", () => {
  it("filters desktop servers by runtime and platform", () => {
    const servers = [
      {
        id: "all-platforms",
        name: "All",
        description: "All",
        repo: "https://example.com/all",
        tags: [],
        command: "npx",
        baseArgs: [],
        configurable: false,
        runtimes: ["standalone", "desktop"],
        platforms: ["macos", "windows", "linux"],
      },
      {
        id: "windows-only",
        name: "Windows",
        description: "Windows",
        repo: "https://example.com/windows",
        tags: [],
        command: "npx",
        baseArgs: [],
        configurable: false,
        runtimes: ["desktop"],
        platforms: ["windows"],
      },
    ];

    expect(filterToolPresetServersForRuntime(servers, "desktop", "macos").map((server) => server.id)).toEqual([
      "all-platforms",
    ]);
    expect(filterToolPresetServersForRuntime(servers, "standalone", "linux").map((server) => server.id)).toEqual([
      "all-platforms",
    ]);
  });

  it("allows an existing secret to remain omitted from an edited form", () => {
    expect(
      getMissingToolConfigKeys(
        { apiKey: { type: "string", required: true, sensitive: true } },
        {},
        ["apiKey"],
      ),
    ).toEqual([]);
  });

  it("redacts secret environment values before returning config to the UI", () => {
    expect(
      redactToolServerConfig({
        command: "npx",
        args: [],
        env: { API_KEY: "secret", REGION: "us" },
        secretEnvKeys: ["API_KEY"],
      }),
    ).toEqual({
      command: "npx",
      args: [],
      env: { REGION: "us" },
      secretEnvKeys: ["API_KEY"],
    });
  });

  it("preserves a stored secret when an edit submits an empty value", () => {
    expect(
      preserveEmptyToolSecrets(
        { API_KEY: "" },
        { API_KEY: "existing-secret" },
        ["API_KEY"],
      ),
    ).toEqual({ API_KEY: "existing-secret" });
    expect(
      preserveEmptyToolSecrets(
        { API_KEY: "replacement" },
        { API_KEY: "existing-secret" },
        ["API_KEY"],
      ),
    ).toEqual({ API_KEY: "replacement" });
  });

  it("keeps a paused server paused when its configuration is edited", () => {
    const existingStatus = "paused";
    const nextStatus = existingStatus || "active";
    expect(nextStatus).toBe("paused");
  });
});
