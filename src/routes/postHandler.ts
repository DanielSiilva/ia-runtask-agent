import { Request, Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { retrieveContext } from "../utils/ragUtils";
import { RAGSource } from "../types/index";
import crypto from "crypto";
import customerSupportCategories from "../data/customer_support_categories.json";
import {
  debugMessage,
  sanitizeHeaderValue,
  logTimestamp,
} from "../utils/helpers";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const responseSchema = z.object({
  response: z.string(),
  thinking: z.string(),
  user_mood: z.enum([
    "positive",
    "neutral",
    "negative",
    "curious",
    "frustrated",
    "confused",
  ]),
  suggested_questions: z.array(z.string()),
  debug: z.object({
    context_used: z.boolean(),
  }),
  matched_categories: z.array(z.string()).optional(),
  redirect_to_agent: z
    .object({
      should_redirect: z.boolean(),
      reason: z.string().optional(),
    })
    .optional(),
});

export async function postHandler(req: Request, res: Response) {
  const apiStart = performance.now();
  const measureTime = (label: string) => logTimestamp(label, apiStart);

  const { messages, model, knowledgeBaseId } = req.body;
  console.log("messages", messages);

  const latestMessage = messages[messages.length - 1].content;

  console.log("📝 Latest Query:", latestMessage);
  measureTime("User Input Received");

  const MAX_DEBUG_LENGTH = 1000;
  const debugData = sanitizeHeaderValue(
    debugMessage("🚀 API route called", {
      messagesReceived: messages.length,
      latestMessageLength: latestMessage.length,
      anthropicKeySlice: process.env.ANTHROPIC_API_KEY?.slice(0, 4) + "****",
    })
  ).slice(0, MAX_DEBUG_LENGTH);

  let retrievedContext = "";
  let isRagWorking = false;
  let ragSources: RAGSource[] = [];

  try {
    console.log("🔍 Initiating RAG retrieval for query:", latestMessage);
    measureTime("RAG Start");
    const result = await retrieveContext(latestMessage, knowledgeBaseId);
    retrievedContext = result.context;
    isRagWorking = result.isRagWorking;
    ragSources = result.ragSources || [];

    if (!result.isRagWorking) {
      console.warn("🚨 RAG Retrieval failed but did not throw!");
    }

    measureTime("RAG Complete");
    console.log("🔍 RAG Retrieved:", isRagWorking ? "YES" : "NO");
    console.log(
      "✅ RAG retrieval completed successfully. Context:",
      retrievedContext.slice(0, 100) + "..."
    );
  } catch (error) {
    console.error("💀 RAG Error:", error);
    console.error("❌ RAG retrieval failed for query:", latestMessage);
    retrievedContext = "";
    isRagWorking = false;
    ragSources = [];
  }

  measureTime("RAG Total Duration");

  const USE_CATEGORIES = true;
  const categoryListString = customerSupportCategories.categories
    .map((c) => c.id)
    .join(", ");

  const categoriesContext = USE_CATEGORIES
    ? `
    To help with our internal classification of inquries, we would like you to categorize inquiries in addition to answering the. We have provided you with ${customerSupportCategories.categories.length} customer support categories.
    Check if your response fits into any category and include the category IDs in your "matched_categories" array.
    The available categories are: ${categoryListString}
    If multiple categories match, include multiple category IDs. If no categories match, return an empty array.
  `
    : "";

  const systemPrompt = `Seu nome é André dos Santos e vocÊ é um atendende de um consultório dentário chamado Dentotec Plus.
  Seu idioma é português brasileiro.
  Responda sempre de maneira prática e objetiva.
  Sua função é fazer agendamento de clientes. Nosso horário de atendimento é de segunda a sexta das 09:00 as 16:00 e sábado das 09:00 as 12:00. A consulta tem duração de 30 minutos.
  Na quinta é feriado..

  To help you answer the user's question, we have retrieved the following information for you. It may or may not be relevant (we are using a RAG pipeline to retrieve this information):
  ${
    isRagWorking
      ? `${retrievedContext}`
      : "No information found for this query."
  }

  Please provide responses that only use the information you have been given. If no information is available or if the information is not relevant for answering the question, you can redirect the user to a human agent for further assistance.

  ${categoriesContext}

  If the question is unrelated to Anthropic's products and services, you should redirect the user to a human agent.

  You are the first point of contact for the user and should try to resolve their issue or provide relevant information. If you are unable to help the user or if the user explicitly asks to talk to a human, you can redirect them to a human agent for further assistance.

  To display your responses correctly, you must format your entire response as a valid JSON object with the following structure:
  {
      "thinking": "Brief explanation of your reasoning for how you should address the user's query",
      "response": "Your concise response to the user",
      "user_mood": "positive|neutral|negative|curious|frustrated|confused",
      "suggested_questions": ["Question 1?", "Question 2?", "Question 3?"],
      "debug": {
        "context_used": true|false
      },
      ${
        USE_CATEGORIES
          ? '"matched_categories": ["category_id1", "category_id2"],'
          : ""
      }
      "redirect_to_agent": {
        "should_redirect": boolean,
        "reason": "Reason for redirection (optional, include only if should_redirect is true)"
      }
    }`;

  try {
    console.log(`🚀 Query Processing`);
    measureTime("Claude Generation Start");

    const anthropicMessages = messages.map((msg: any) => ({
      role: msg.role,
      content: msg.content,
    }));

    anthropicMessages.push({
      role: "assistant",
      content: "{",
    });

    const response = await anthropic.messages.create({
      model: model,
      max_tokens: 1000,
      messages: anthropicMessages,
      system: systemPrompt,
      temperature: 0.3,
    });

    measureTime("Claude Generation Complete");
    console.log("✅ Message generation completed");

    const textContent =
      "{" +
      response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join(" ");

    const parsedResponse = JSON.parse(textContent);
    const validatedResponse = responseSchema.parse(parsedResponse);

    const responseWithId = {
      id: crypto.randomUUID(),
      ...validatedResponse,
    };

    if (responseWithId.redirect_to_agent?.should_redirect) {
      console.log("🚨 AGENT REDIRECT TRIGGERED!");
      console.log("Reason:", responseWithId.redirect_to_agent.reason);
    }

    res.setHeader("Content-Type", "application/json");

    if (ragSources.length > 0) {
      res.setHeader(
        "x-rag-sources",
        sanitizeHeaderValue(JSON.stringify(ragSources))
      );
    }

    res.setHeader("X-Debug-Data", sanitizeHeaderValue(debugData));

    measureTime("API Complete");

    res.status(200).json(responseWithId);
  } catch (error) {
    console.error("💥 Error in message generation:", error);
    const errorResponse = {
      response:
        "Sorry, there was an issue processing your request. Please try again later.",
      thinking: "Error occurred during message generation.",
      user_mood: "neutral",
      debug: { context_used: false },
    };
    res.status(500).json(errorResponse);
  }
}
