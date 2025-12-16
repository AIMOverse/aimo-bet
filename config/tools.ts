/**
 * Tool Configuration
 *
 * Built-in AI SDK tools and tool metadata.
 * These tools execute server-side in the /api/chat route.
 */

import { tool } from "ai";
import { z } from "zod";
import type { BuiltInToolConfig } from "@/types/tools";

// ============================================================================
// Built-in Tools (AI SDK format)
// ============================================================================

/**
 * Built-in tools that execute server-side.
 * These are always available and don't require MCP connections.
 */
export const BUILT_IN_TOOLS = {
  /**
   * Get current date and time
   */
  getCurrentTime: tool({
    description: "Get the current date and time in various formats",
    inputSchema: z.object({
      timezone: z.string().default("UTC"),
      format: z.enum(["iso", "unix", "human"]).default("human"),
    }),
    execute: async ({ timezone, format }) => {
      const now = new Date();

      switch (format) {
        case "iso":
          return { time: now.toISOString(), timezone };
        case "unix":
          return { timestamp: Math.floor(now.getTime() / 1000), timezone };
        case "human":
        default:
          return {
            time: now.toLocaleString("en-US", { timeZone: timezone }),
            timezone,
            date: now.toLocaleDateString("en-US", { timeZone: timezone }),
          };
      }
    },
  }),

  /**
   * Generate a UUID
   */
  generateUUID: tool({
    description: "Generate a random UUID (v4)",
    inputSchema: z.object({
      count: z.number().min(1).max(10).default(1),
    }),
    execute: async ({ count }) => {
      const uuids = Array.from({ length: count }, () => crypto.randomUUID());
      return count === 1 ? { uuid: uuids[0] } : { uuids };
    },
  }),

  /**
   * Encode/decode base64
   */
  base64: tool({
    description: "Encode or decode base64 strings",
    inputSchema: z.object({
      action: z.enum(["encode", "decode"]),
      input: z.string(),
    }),
    execute: async ({ action, input }) => {
      try {
        if (action === "encode") {
          return { result: Buffer.from(input).toString("base64") };
        } else {
          return { result: Buffer.from(input, "base64").toString("utf-8") };
        }
      } catch {
        return { error: "Invalid input for base64 operation" };
      }
    },
  }),

  /**
   * URL encode/decode
   */
  urlEncode: tool({
    description: "Encode or decode URL components",
    inputSchema: z.object({
      action: z.enum(["encode", "decode"]),
      input: z.string(),
    }),
    execute: async ({ action, input }) => {
      try {
        if (action === "encode") {
          return { result: encodeURIComponent(input) };
        } else {
          return { result: decodeURIComponent(input) };
        }
      } catch {
        return { error: "Invalid input for URL encoding operation" };
      }
    },
  }),

  /**
   * JSON formatter/validator
   */
  jsonFormat: tool({
    description: "Format, validate, or minify JSON",
    inputSchema: z.object({
      input: z.string(),
      action: z.enum(["format", "minify", "validate"]).default("format"),
      indent: z.number().min(0).max(8).default(2),
    }),
    execute: async ({ input, action, indent }) => {
      try {
        const parsed = JSON.parse(input);

        switch (action) {
          case "validate":
            return { valid: true, type: Array.isArray(parsed) ? "array" : typeof parsed };
          case "minify":
            return { result: JSON.stringify(parsed) };
          case "format":
          default:
            return { result: JSON.stringify(parsed, null, indent) };
        }
      } catch {
        if (action === "validate") {
          return { valid: false, error: "Invalid JSON" };
        }
        return { error: "Invalid JSON input" };
      }
    },
  }),
};

// ============================================================================
// Built-in Tool Configurations (for UI)
// ============================================================================

/**
 * Metadata for built-in tools (used in UI)
 */
export const BUILT_IN_TOOL_CONFIGS: BuiltInToolConfig[] = [
  {
    id: "getCurrentTime",
    name: "Current Time",
    description: "Get the current date and time",
    category: "utilities",
    enabled: true,
  },
  {
    id: "generateUUID",
    name: "UUID Generator",
    description: "Generate random UUIDs",
    category: "utilities",
    enabled: true,
  },
  {
    id: "base64",
    name: "Base64 Encoder",
    description: "Encode or decode base64 strings",
    category: "encoding",
    enabled: true,
  },
  {
    id: "urlEncode",
    name: "URL Encoder",
    description: "Encode or decode URL components",
    category: "encoding",
    enabled: true,
  },
  {
    id: "jsonFormat",
    name: "JSON Formatter",
    description: "Format, validate, or minify JSON",
    category: "formatting",
    enabled: true,
  },
];

// ============================================================================
// Tool Categories
// ============================================================================

/**
 * Tool categories for filtering
 */
export const TOOL_CATEGORIES = [
  { id: "utilities", name: "Utilities" },
  { id: "encoding", name: "Encoding & Decoding" },
  { id: "formatting", name: "Formatting" },
  { id: "data", name: "Data Processing" },
  { id: "web", name: "Web & API" },
  { id: "ai", name: "AI & ML" },
] as const;

export type ToolCategory = (typeof TOOL_CATEGORIES)[number]["id"];
