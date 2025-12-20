import type { LanguageModelMiddleware } from "ai";

/**
 * Logging middleware for language model calls.
 * Logs request start/end times and basic metrics.
 */
export const loggingMiddleware: LanguageModelMiddleware = {
  specificationVersion: "v3",

  wrapGenerate: async ({ doGenerate }) => {
    const start = Date.now();

    console.log(`[AI] Generate started`);

    const result = await doGenerate();

    const duration = Date.now() - start;
    console.log(`[AI] Generate completed | duration: ${duration}ms`);

    return result;
  },

  wrapStream: async ({ doStream }) => {
    const start = Date.now();

    console.log(`[AI] Stream started`);

    const { stream, ...rest } = await doStream();

    // Create a pass-through transform that logs on completion
    const transformStream = new TransformStream({
      transform(chunk, controller) {
        controller.enqueue(chunk);
      },
      flush() {
        const duration = Date.now() - start;
        console.log(`[AI] Stream completed | duration: ${duration}ms`);
      },
    });

    return {
      stream: stream.pipeThrough(transformStream),
      ...rest,
    };
  },
};
