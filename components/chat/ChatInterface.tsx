"use client";

import { memo, type ChangeEvent, useCallback } from "react";
import type { UIMessage, ChatStatus } from "ai";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputTools,
  PromptInputSubmit,
  PromptInputAttachments,
  PromptInputAttachment,
  PromptInputActionMenu,
  PromptInputActionMenuTrigger,
  PromptInputActionMenuContent,
  PromptInputActionAddAttachments,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import { Image } from "@/components/ai-elements/image";
import { Video } from "@/components/chat/video";
import {
  Tool,
  ToolHeader,
  ToolContent,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
import { ChatModelSelector } from "./ChatModelSelector";
import { ChatToolMenuItems } from "./ChatToolSelector";
import { useChatMessages } from "@/hooks/chat";
import { useIsOffline } from "@/hooks/use-offline";
import { Streamdown } from "streamdown";

const suggestions = [
  "What are the latest trends in AI?",
  "How does machine learning work?",
  "Explain quantum computing",
  "Best practices for React development",
];

interface ChatInterfaceProps {
  sessionId: string | null;
}

export const ChatInterface = memo(function ChatInterface({
  sessionId,
}: ChatInterfaceProps) {
  // Sessions are created server-side on first message
  const { messages, input, setInput, isLoading, sendMessage, stop } =
    useChatMessages({
      sessionId,
    });

  // Show toast when offline
  useIsOffline();

  const handleSubmit = useCallback(
    async (message: PromptInputMessage) => {
      const hasText = message.text.trim().length > 0;
      const hasFiles = message.files && message.files.length > 0;

      if (!hasText && !hasFiles) return;

      await sendMessage(message.text, message.files);
    },
    [sendMessage],
  );

  // Determine chat status for submit button
  const status: ChatStatus = isLoading ? "streaming" : "ready";

  const isEmpty = messages.length === 0;

  // Shared input component to avoid duplication
  const promptInput = (
    <PromptInput
      onSubmit={handleSubmit}
      className="mx-auto w-full max-w-3xl p-4"
    >
      <PromptInputAttachments>
        {(attachment) => (
          <PromptInputAttachment key={attachment.id} data={attachment} />
        )}
      </PromptInputAttachments>
      <PromptInputTextarea
        value={input}
        onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
          setInput(e.target.value)
        }
        placeholder={"Send a message..."}
      />
      <PromptInputFooter>
        <PromptInputTools>
          <PromptInputActionMenu>
            <PromptInputActionMenuTrigger />
            <PromptInputActionMenuContent>
              <PromptInputActionAddAttachments />
              <ChatToolMenuItems />
            </PromptInputActionMenuContent>
          </PromptInputActionMenu>
        </PromptInputTools>
        <div className="flex items-center gap-1">
          <ChatModelSelector />
          <PromptInputSubmit
            status={status}
            onClick={isLoading ? stop : undefined}
          />
        </div>
      </PromptInputFooter>
    </PromptInput>
  );

  return (
    <div className="flex h-full flex-col">
      <Conversation className="flex-1">
        {isEmpty ? (
          <ConversationEmptyState>
            <div className="mb-8 text-center">
              <h1 className="text-2xl font-semibold tracking-tight">
                Uncensored & Private AI
              </h1>
              <p className="mt-2 text-muted-foreground">
                No Subscription. No Top Up. No KYC. No Censorship.
              </p>
            </div>
            {promptInput}
            <Suggestions className="mt-4">
              {suggestions.map((suggestion) => (
                <Suggestion
                  key={suggestion}
                  suggestion={suggestion}
                  onClick={(text) => setInput(text)}
                />
              ))}
            </Suggestions>
          </ConversationEmptyState>
        ) : (
          <ConversationContent>
            {messages.map((message) => (
              <ChatMessage key={message.id} message={message} />
            ))}
          </ConversationContent>
        )}
        <ConversationScrollButton />
      </Conversation>

      {/* Input Area - only show at bottom when there are messages */}
      {!isEmpty && promptInput}
    </div>
  );
});

interface ChatMessageProps {
  message: UIMessage;
}

/** Result type from generateImage tool */
interface GenerateImageResult {
  success: boolean;
  image?: { base64: string; mediaType: string };
  prompt: string;
  revisedPrompt?: string;
  error?: string;
}

/** Result type from generateVideo tool */
interface GenerateVideoResult {
  success: boolean;
  video?: { url: string; mediaType: string };
  prompt: string;
  error?: string;
}

const ChatMessage = memo(function ChatMessage({ message }: ChatMessageProps) {
  return (
    <Message from={message.role}>
      <MessageContent>
        {message.parts?.map((part, index) => {
          // Text content
          if (part.type === "text") {
            return message.role === "assistant" ? (
              <Streamdown key={index}>{part.text}</Streamdown>
            ) : (
              <div key={index} className="whitespace-pre-wrap">
                {part.text}
              </div>
            );
          }

          // File/image parts (from multimodal models or response.images[])
          if (part.type === "file" && part.mediaType?.startsWith("image/")) {
            const filePart = part as { url: string; mediaType: string };
            const base64 = filePart.url.replace(/^data:[^;]+;base64,/, "");
            return (
              <Image
                key={index}
                base64={base64}
                uint8Array={new Uint8Array()}
                mediaType={filePart.mediaType}
                alt="Generated image"
                className="mt-2 max-w-md"
              />
            );
          }

          // Tool invocations (type is "tool-{toolName}" in AI SDK v6)
          if (part.type.startsWith("tool-")) {
            const toolPart = part as unknown as {
              type: string;
              toolCallId: string;
              state:
                | "input-streaming"
                | "input-available"
                | "output-available"
                | "output-error"
                | "output-denied";
              input?: unknown;
              output?: unknown;
              errorText?: string;
            };

            // Extract tool name from type (e.g., "tool-generateImage" -> "generateImage")
            const toolName = toolPart.type.replace(/^tool-/, "");

            // Special rendering for generateImage tool results
            if (
              toolName === "generateImage" &&
              toolPart.state === "output-available"
            ) {
              const result = toolPart.output as GenerateImageResult;

              if (result?.success && result.image) {
                return (
                  <div key={index} className="mt-2 space-y-2">
                    <Image
                      base64={result.image.base64}
                      uint8Array={new Uint8Array()}
                      mediaType={result.image.mediaType}
                      alt={result.revisedPrompt || result.prompt}
                      className="max-w-md rounded-lg"
                    />
                    {result.revisedPrompt &&
                      result.revisedPrompt !== result.prompt && (
                        <p className="text-xs text-muted-foreground">
                          Prompt enhanced: {result.revisedPrompt}
                        </p>
                      )}
                  </div>
                );
              }
            }

            // Special rendering for generateVideo tool results
            if (
              toolName === "generateVideo" &&
              toolPart.state === "output-available"
            ) {
              const result = toolPart.output as GenerateVideoResult;

              if (result?.success && result.video) {
                return (
                  <div key={index} className="mt-2 space-y-2">
                    <Video
                      url={result.video.url}
                      mediaType={result.video.mediaType}
                      className="max-w-md rounded-lg"
                    />
                    <p className="text-xs text-muted-foreground">
                      Prompt: {result.prompt}
                    </p>
                  </div>
                );
              }
            }

            // Default tool rendering using Tool components
            return (
              <Tool key={index}>
                <ToolHeader
                  title={toolName}
                  type="tool-invocation"
                  state={toolPart.state}
                />
                <ToolContent>
                  <ToolInput input={toolPart.input} />
                  {toolPart.state === "output-available" && (
                    <ToolOutput
                      output={toolPart.output}
                      errorText={undefined}
                    />
                  )}
                  {toolPart.state === "output-error" && (
                    <ToolOutput
                      output={undefined}
                      errorText={toolPart.errorText}
                    />
                  )}
                </ToolContent>
              </Tool>
            );
          }

          return null;
        })}
      </MessageContent>
    </Message>
  );
});
