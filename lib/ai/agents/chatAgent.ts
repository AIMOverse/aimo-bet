import { ToolLoopAgent, stepCountIs } from "ai";
import { z } from "zod";
import { getModel } from "@/lib/ai/registry";
import { DEFAULT_SYSTEM_PROMPT } from "@/config/defaults";
import { generateImageTool, generateVideoTool } from "@/lib/ai/tools";

// Tool names type
type ToolName = "generateImage" | "generateVideo";

// Schema for runtime call options
const chatCallOptionsSchema = z.object({
  model: z.string().default("openrouter/gpt-4o"),
  tools: z
    .object({
      generateImage: z.boolean().default(false),
      generateVideo: z.boolean().default(false),
      webSearch: z.boolean().default(false),
    })
    .default({
      generateImage: false,
      generateVideo: false,
      webSearch: false,
    }),
});

export type ChatCallOptions = z.infer<typeof chatCallOptionsSchema>;

// All available tools
const allTools = {
  generateImage: generateImageTool,
  generateVideo: generateVideoTool,
  // Future: webSearch, etc.
};

export const chatAgent = new ToolLoopAgent({
  // Default model (overridden by prepareCall)
  model: getModel("openrouter/gpt-4o"),

  // System instructions
  instructions: DEFAULT_SYSTEM_PROMPT,

  // All tools available to the agent
  tools: allTools,

  // Stop after 5 steps max (for multi-tool scenarios)
  stopWhen: stepCountIs(5),

  // Call options schema for type-safe runtime configuration
  callOptionsSchema: chatCallOptionsSchema,

  // Configure agent based on request options
  prepareCall: ({ options, ...settings }) => {
    // Determine which tools are active based on request
    const activeTools: ToolName[] = [];
    if (options.tools.generateImage) activeTools.push("generateImage");
    if (options.tools.generateVideo) activeTools.push("generateVideo");
    // Future: if (options.tools.webSearch) activeTools.push("webSearch");

    return {
      ...settings,
      model: getModel(options.model),
      activeTools: activeTools.length > 0 ? activeTools : undefined,
    };
  },
});

// Export type for UI message typing
export type ChatAgentUIMessage =
  typeof chatAgent extends ToolLoopAgent<infer _T, infer _O, infer M>
    ? M
    : never;
