import "server-only";
import { generateText } from "ai";
import { createGoogle } from "@ai-sdk/google";
import type { AppLocale } from "../i18n";
import type { ChatMessage, ChatReply } from "../chat";
import { requestAiChat } from "./ai-chat-core";
import { requestChatEvidence } from "./chat-search";
import { configuredModel, isGeminiReviewConfigured } from "./gemini-review";
import { createAbortScope } from "./abort-scope";
import { localChatReply } from "../chat-local";
import { parseChatMessages } from "../chat";
import type { SearchTopic } from "../search-topics";

export async function getAiChatReply(messages: ChatMessage[], locale: AppLocale, signal?: AbortSignal, topic: SearchTopic = "general"): Promise<ChatReply> {
  if (!parseChatMessages(messages)) return { status: "unavailable", reason: "provider-unavailable" };
  const local = localChatReply(messages, locale);
  if (local) return local;
  if (!isGeminiReviewConfigured()) return { status: "unavailable", reason: "not-configured" };
  const scope = createAbortScope(signal, 25_000);
  try {
    const google = createGoogle({ apiKey: process.env.GEMINI_API_KEY!.trim() });
    return await requestAiChat(messages, locale, {
      search: (text, language, topic) => requestChatEvidence({ text, locale: language, topic, apiKey: process.env.TAVILY_API_KEY!.trim(), signal: scope.signal }),
      generate: async (instructions, history) => {
        const result = await generateText({ model: google(configuredModel()), instructions, messages: history, maxOutputTokens: 1500, maxRetries: 0, abortSignal: scope.signal });
        return result.text;
      },
    }, topic);
  } finally { scope.cleanup(); }
}
