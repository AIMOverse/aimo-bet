/**
 * WorkflowChatTransport - Client-safe copy from @workflow/ai
 *
 * This is a direct copy of the WorkflowChatTransport class to avoid importing
 * from "@workflow/ai" main entry which includes DurableAgent that pulls in
 * the "workflow" package with node:async_hooks (server-only).
 *
 * @see https://useworkflow.dev/docs/ai/resumable-streams
 */

import {
  parseJsonEventStream,
  uiMessageChunkSchema,
  type UIMessage,
  type ChatTransport,
} from "ai";

// ============================================================================
// Stream Iterator Utilities
// ============================================================================

function iteratorToStream<T>(
  iterator: AsyncGenerator<T>,
  { signal }: { signal?: AbortSignal } = {},
): ReadableStream<T> {
  let abortHandler: (() => void) | undefined;
  return new ReadableStream<T>({
    start(controller) {
      if (signal) {
        if (signal.aborted) {
          controller.error(signal.reason || new Error("Aborted"));
          return;
        }
        abortHandler = () => {
          controller.error(signal.reason || new Error("Aborted"));
          if (iterator.return) {
            iterator.return(undefined);
          }
        };
        signal.addEventListener("abort", abortHandler);
      }
    },
    async pull(controller) {
      try {
        const { value, done } = await iterator.next();
        if (done) {
          controller.close();
        } else {
          controller.enqueue(value);
        }
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel(_reason) {
      if (abortHandler && signal) {
        signal.removeEventListener("abort", abortHandler);
      }
      if (iterator.return) {
        await iterator.return(undefined);
      }
    },
  });
}

async function* streamToIterator<T>(
  stream: ReadableStream<T>,
): AsyncGenerator<T> {
  const reader = stream.getReader();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      yield value;
    }
  } finally {
    reader.releaseLock();
  }
}

// ============================================================================
// Types
// ============================================================================

interface SendMessagesOptions<UI_MESSAGE extends UIMessage> {
  trigger: "submit-message" | "regenerate-message";
  chatId: string;
  messageId: string | undefined;
  messages: UI_MESSAGE[];
  abortSignal: AbortSignal | undefined;
  headers?: Record<string, string> | Headers;
  body?: object;
  metadata?: unknown;
}

interface ReconnectToStreamOptions {
  chatId: string;
}

export interface WorkflowChatTransportOptions<UI_MESSAGE extends UIMessage> {
  api?: string;
  fetch?: typeof fetch;
  onChatSendMessage?: (
    response: Response,
    options: SendMessagesOptions<UI_MESSAGE>,
  ) => void | Promise<void>;
  onChatEnd?: (options: {
    chatId: string;
    chunkIndex: number;
  }) => void | Promise<void>;
  maxConsecutiveErrors?: number;
  prepareSendMessagesRequest?: (options: {
    id: string;
    messages: UI_MESSAGE[];
    requestMetadata: unknown;
    body: unknown;
    credentials: RequestCredentials | undefined;
    headers: HeadersInit | undefined;
    api: string;
    trigger: "submit-message" | "regenerate-message";
    messageId: string | undefined;
  }) =>
    | Promise<
        | {
            api?: string;
            body?: unknown;
            headers?: HeadersInit;
            credentials?: RequestCredentials;
          }
        | undefined
      >
    | {
        api?: string;
        body?: unknown;
        headers?: HeadersInit;
        credentials?: RequestCredentials;
      }
    | undefined;
  prepareReconnectToStreamRequest?: (options: {
    id: string;
    requestMetadata: unknown;
    body: unknown;
    credentials: RequestCredentials | undefined;
    headers: HeadersInit | undefined;
    api: string;
  }) =>
    | Promise<
        | {
            api?: string;
            headers?: HeadersInit;
            credentials?: RequestCredentials;
          }
        | undefined
      >
    | {
        api?: string;
        headers?: HeadersInit;
        credentials?: RequestCredentials;
      }
    | undefined;
}

// ============================================================================
// WorkflowChatTransport
// ============================================================================

export class WorkflowChatTransport<UI_MESSAGE extends UIMessage>
  implements ChatTransport<UI_MESSAGE>
{
  private api: string;
  private customFetch: typeof fetch;
  private onChatSendMessage?: WorkflowChatTransportOptions<UI_MESSAGE>["onChatSendMessage"];
  private onChatEnd?: WorkflowChatTransportOptions<UI_MESSAGE>["onChatEnd"];
  private maxConsecutiveErrors: number;
  private prepareSendMessagesRequest?: WorkflowChatTransportOptions<UI_MESSAGE>["prepareSendMessagesRequest"];
  private prepareReconnectToStreamRequest?: WorkflowChatTransportOptions<UI_MESSAGE>["prepareReconnectToStreamRequest"];

  constructor(options: WorkflowChatTransportOptions<UI_MESSAGE> = {}) {
    this.api = options.api ?? "/api/chat";
    this.customFetch = options.fetch ?? fetch.bind(globalThis);
    this.onChatSendMessage = options.onChatSendMessage;
    this.onChatEnd = options.onChatEnd;
    this.maxConsecutiveErrors = options.maxConsecutiveErrors ?? 3;
    this.prepareSendMessagesRequest = options.prepareSendMessagesRequest;
    this.prepareReconnectToStreamRequest =
      options.prepareReconnectToStreamRequest;
  }

  async sendMessages(
    options: SendMessagesOptions<UI_MESSAGE>,
  ): Promise<ReadableStream> {
    return iteratorToStream(this.sendMessagesIterator(options), {
      signal: options.abortSignal,
    });
  }

  private async *sendMessagesIterator(
    options: SendMessagesOptions<UI_MESSAGE>,
  ) {
    const { chatId, messages, abortSignal, trigger, messageId } = options;

    let gotFinish = false;
    let chunkIndex = 0;

    const requestConfig = this.prepareSendMessagesRequest
      ? await this.prepareSendMessagesRequest({
          id: chatId,
          messages,
          requestMetadata: undefined,
          body: undefined,
          credentials: undefined,
          headers: undefined,
          api: this.api,
          trigger,
          messageId,
        })
      : undefined;

    const url = requestConfig?.api ?? this.api;
    const res = await this.customFetch(url, {
      method: "POST",
      body: JSON.stringify(requestConfig?.body ?? { messages }),
      headers: requestConfig?.headers,
      credentials: requestConfig?.credentials,
      signal: abortSignal,
    });

    if (!res.ok || !res.body) {
      throw new Error(
        `Failed to fetch chat: ${res.status} ${await res.text()}`,
      );
    }

    const workflowRunId = res.headers.get("x-workflow-run-id");
    if (!workflowRunId) {
      throw new Error(
        'Workflow run ID not found in "x-workflow-run-id" response header',
      );
    }

    await this.onChatSendMessage?.(res, options);

    try {
      const chunkStream = parseJsonEventStream({
        stream: res.body,
        schema: uiMessageChunkSchema,
      });
      for await (const chunk of streamToIterator(chunkStream)) {
        if (!chunk.success) {
          throw chunk.error;
        }
        chunkIndex++;
        yield chunk.value;
        if (chunk.value.type === "finish") {
          gotFinish = true;
        }
      }
    } catch (error) {
      console.error("Error in chat POST stream", error);
    }

    if (gotFinish) {
      await this.onFinish(gotFinish, { chatId, chunkIndex });
    } else {
      yield* this.reconnectToStreamIterator(options, workflowRunId, chunkIndex);
    }
  }

  async reconnectToStream(
    options: ReconnectToStreamOptions,
  ): Promise<ReadableStream> {
    const it = this.reconnectToStreamIterator(options);
    return iteratorToStream(it);
  }

  private async *reconnectToStreamIterator(
    options: ReconnectToStreamOptions,
    workflowRunId?: string,
    initialChunkIndex = 0,
  ) {
    let chunkIndex = initialChunkIndex;
    const defaultApi = `${this.api}/${encodeURIComponent(workflowRunId ?? options.chatId)}/stream`;

    const requestConfig = this.prepareReconnectToStreamRequest
      ? await this.prepareReconnectToStreamRequest({
          id: options.chatId,
          requestMetadata: undefined,
          body: undefined,
          credentials: undefined,
          headers: undefined,
          api: defaultApi,
        })
      : undefined;

    const baseUrl = requestConfig?.api ?? defaultApi;
    let gotFinish = false;
    let consecutiveErrors = 0;

    while (!gotFinish) {
      const url = `${baseUrl}?startIndex=${chunkIndex}`;
      const res = await this.customFetch(url, {
        headers: requestConfig?.headers,
        credentials: requestConfig?.credentials,
      });

      if (!res.ok || !res.body) {
        throw new Error(
          `Failed to fetch chat: ${res.status} ${await res.text()}`,
        );
      }

      try {
        const chunkStream = parseJsonEventStream({
          stream: res.body,
          schema: uiMessageChunkSchema,
        });
        for await (const chunk of streamToIterator(chunkStream)) {
          if (!chunk.success) {
            throw chunk.error;
          }
          chunkIndex++;
          yield chunk.value;
          if (chunk.value.type === "finish") {
            gotFinish = true;
          }
        }
        consecutiveErrors = 0;
      } catch (error) {
        console.error("Error in chat GET reconnectToStream", error);
        consecutiveErrors++;
        if (consecutiveErrors >= this.maxConsecutiveErrors) {
          throw new Error(
            `Failed to reconnect after ${this.maxConsecutiveErrors} consecutive errors. Last error: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }

    await this.onFinish(gotFinish, { chatId: options.chatId, chunkIndex });
  }

  private async onFinish(
    gotFinish: boolean,
    { chatId, chunkIndex }: { chatId: string; chunkIndex: number },
  ) {
    if (gotFinish) {
      await this.onChatEnd?.({ chatId, chunkIndex });
    } else {
      throw new Error("No finish chunk received");
    }
  }
}
