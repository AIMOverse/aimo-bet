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
import { ChatModelSelector } from "./ChatModelSelector";
import { ChatAgentSelector } from "./ChatAgentSelector";
import { ChatToolSelector } from "./ChatToolSelector";
import { useChatMessages, useSessions } from "@/hooks/chat";
import { MessageSquareIcon } from "lucide-react";
import { Streamdown } from "streamdown";
import { Separator } from "@/components/ui/separator";

interface ChatInterfaceProps {
  sessionId: string | null;
}

export const ChatInterface = memo(function ChatInterface({
  sessionId,
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
            <ChatModelSelector />
            <Separator orientation="vertical" className="h-4" />
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

const ChatMessage = memo(function ChatMessage({ message }: ChatMessageProps) {
  // Get text content from message parts
  const textContent =
    message.parts
      ?.filter(
        (part): part is { type: "text"; text: string } => part.type === "text",
      )
      .map((part) => part.text)
      .join("") ?? "";

  return (
    <Message from={message.role}>
      <MessageContent>
        {message.role === "assistant" ? (
          <Streamdown>{textContent}</Streamdown>
        ) : (
          <div className="whitespace-pre-wrap">{textContent}</div>
        )}
      </MessageContent>
    </Message>
  );
});
