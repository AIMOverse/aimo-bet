"use client";

import { memo, useCallback, type ChangeEvent } from "react";
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
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import { Image } from "@/components/ai-elements/image";
import {
  Tool,
  ToolHeader,
  ToolContent,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ChatModelSelector } from "./ChatModelSelector";
import { ChatAgentSelector } from "./ChatAgentSelector";
import { ChatToolSelector } from "./ChatToolSelector";
import { useChatMessages, useSessions } from "@/hooks/chat";
import { MessageSquareIcon } from "lucide-react";
import { Streamdown } from "streamdown";
import { Separator } from "@/components/ui/separator";

interface ChatInterfaceProps {
  sessionId: string | null;
  sessionTitle?: string;
}

export const ChatInterface = memo(function ChatInterface({
  sessionId,
  sessionTitle,
}: ChatInterfaceProps) {
  const { createSession } = useSessions();

  const handleCreateSession = useCallback(async () => {
    const session = await createSession();
    return session.id;
  }, [createSession]);

  const { messages, input, setInput, isLoading, sendMessage, stop } =
    useChatMessages({
      sessionId,
      onCreateSession: handleCreateSession,
    });

  const handleSubmit = useCallback(
    async (message: PromptInputMessage) => {
      if (!message.text.trim()) return;
      await sendMessage(message.text);
    },
    [sendMessage],
  );

  // Determine chat status for submit button
  const status: ChatStatus = isLoading ? "streaming" : "ready";

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="h-4" />
        <h1 className="text-sm font-medium truncate flex-1">
          {sessionTitle || "New Chat"}
        </h1>
        <ChatModelSelector />
      </header>

      {/* Messages Area */}
      <Conversation className="flex-1">
        {messages.length === 0 ? (
          <ConversationEmptyState
            title="Start a conversation"
            description="Send a message to begin chatting with AI"
            icon={<MessageSquareIcon className="size-8" />}
          />
        ) : (
          <ConversationContent>
            {messages.map((message) => (
              <ChatMessage key={message.id} message={message} />
            ))}
          </ConversationContent>
        )}
        <ConversationScrollButton />
      </Conversation>

      {/* Input Area */}
      <PromptInput onSubmit={handleSubmit} className="mx-auto max-w-3xl">
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
          placeholder="Send a message..."
        />
        <PromptInputFooter>
          <PromptInputTools>
            <ChatAgentSelector />
            <ChatToolSelector />
          </PromptInputTools>
          <PromptInputSubmit
            status={status}
            onClick={isLoading ? stop : undefined}
          />
        </PromptInputFooter>
      </PromptInput>
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
