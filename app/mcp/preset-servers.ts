import { PresetServer } from "./types";

const OFFICIAL_REPO_BASE =
  "https://github.com/modelcontextprotocol/servers/tree/main/src";

export const OFFICIAL_MCP_PRESET_SERVERS: PresetServer[] = [
  {
    id: "brave-search",
    name: "Brave Search",
    description:
      "Official Brave MCP server for web search using the Brave Search API.",
    repo: "https://github.com/brave/brave-search-mcp-server",
    tags: ["official", "search", "web"],
    command: "npx",
    baseArgs: ["-y", "@brave/brave-search-mcp-server", "--transport", "stdio"],
    configurable: true,
    configSchema: {
      properties: {
        braveApiKey: {
          type: "string",
          description: "Brave Search API Key.",
          required: true,
          helpUrl: "https://api-dashboard.search.brave.com/login",
          helpLabel: "Get API Key",
        },
      },
    },
    argsMapping: {
      braveApiKey: {
        type: "env",
        key: "BRAVE_API_KEY",
      },
    },
  },
  {
    id: "fetch",
    name: "Fetch",
    description: "Official MCP server for fetching and converting web content.",
    repo: `${OFFICIAL_REPO_BASE}/fetch`,
    tags: ["official", "web", "http"],
    command: "uvx",
    baseArgs: ["mcp-server-fetch"],
    configurable: false,
  },
  {
    id: "filesystem",
    name: "Filesystem",
    description:
      "Official MCP server for reading and writing files within allowed directories.",
    repo: `${OFFICIAL_REPO_BASE}/filesystem`,
    tags: ["official", "local", "files"],
    command: "npx",
    baseArgs: ["-y", "@modelcontextprotocol/server-filesystem"],
    configurable: true,
    configSchema: {
      properties: {
        paths: {
          type: "array",
          description:
            "Allowed root directories. This client does not provide MCP Roots, so at least one path is required.",
          required: true,
          minItems: 1,
          itemLabel: "Path",
          addButtonText: "Add Path",
        },
      },
    },
    argsMapping: {
      paths: {
        type: "spread",
        position: 2,
      },
    },
  },
  {
    id: "git",
    name: "Git",
    description:
      "Official MCP server for inspecting and operating on a local Git repository.",
    repo: `${OFFICIAL_REPO_BASE}/git`,
    tags: ["official", "local", "git"],
    command: "uvx",
    baseArgs: ["mcp-server-git", "--repository", ""],
    configurable: true,
    configSchema: {
      properties: {
        repository: {
          type: "string",
          description: "Absolute path to the local Git repository.",
          required: true,
        },
      },
    },
    argsMapping: {
      repository: {
        type: "single",
        position: 2,
      },
    },
  },
  {
    id: "memory",
    name: "Memory",
    description:
      "Official MCP server for persistent memory backed by a local knowledge graph.",
    repo: `${OFFICIAL_REPO_BASE}/memory`,
    tags: ["official", "memory", "knowledge-graph"],
    command: "npx",
    baseArgs: ["-y", "@modelcontextprotocol/server-memory"],
    configurable: false,
  },
  {
    id: "sequentialthinking",
    name: "Sequential Thinking",
    description:
      "Official MCP server for step-by-step reasoning and structured problem solving.",
    repo: `${OFFICIAL_REPO_BASE}/sequentialthinking`,
    tags: ["official", "reasoning", "tools"],
    command: "npx",
    baseArgs: ["-y", "@modelcontextprotocol/server-sequential-thinking"],
    configurable: false,
  },
  {
    id: "time",
    name: "Time",
    description: "Official MCP server for timezone and current time utilities.",
    repo: `${OFFICIAL_REPO_BASE}/time`,
    tags: ["official", "time", "timezone"],
    command: "uvx",
    baseArgs: ["mcp-server-time"],
    configurable: false,
  },
  {
    id: "everything",
    name: "Everything",
    description:
      "Official MCP reference server that exercises most protocol features for testing.",
    repo: `${OFFICIAL_REPO_BASE}/everything`,
    tags: ["official", "reference", "testing"],
    command: "npx",
    baseArgs: ["-y", "@modelcontextprotocol/server-everything"],
    configurable: false,
  },
];
