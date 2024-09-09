"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.postHandler = postHandler;
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const zod_1 = require("zod");
const ragUtils_1 = require("../utils/ragUtils");
const crypto_1 = __importDefault(require("crypto"));
const customer_support_categories_json_1 = __importDefault(require("../data/customer_support_categories.json"));
const helpers_1 = require("../utils/helpers");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const anthropic = new sdk_1.default({
    apiKey: process.env.ANTHROPIC_API_KEY,
});
const responseSchema = zod_1.z.object({
    response: zod_1.z.string(),
    thinking: zod_1.z.string(),
    user_mood: zod_1.z.enum([
        "positive",
        "neutral",
        "negative",
        "curious",
        "frustrated",
        "confused",
    ]),
    suggested_questions: zod_1.z.array(zod_1.z.string()),
    debug: zod_1.z.object({
        context_used: zod_1.z.boolean(),
    }),
    matched_categories: zod_1.z.array(zod_1.z.string()).optional(),
    redirect_to_agent: zod_1.z
        .object({
        should_redirect: zod_1.z.boolean(),
        reason: zod_1.z.string().nullable().optional(),
    })
        .optional(),
});
async function postHandler(req, res) {
    var _a, _b;
    const apiStart = performance.now();
    const measureTime = (label) => (0, helpers_1.logTimestamp)(label, apiStart);
    const { messages, model, knowledgeBaseId, context } = req.body;
    console.log("messages", messages);
    console.log("messages", messages);
    const latestMessage = messages[messages.length - 1].content;
    // console.log("📝 Latest Query:", latestMessage);
    measureTime("User Input Received");
    const MAX_DEBUG_LENGTH = 1000;
    const debugData = (0, helpers_1.sanitizeHeaderValue)((0, helpers_1.debugMessage)("🚀 API route called", {
        messagesReceived: messages.length,
        latestMessageLength: latestMessage.length,
        anthropicKeySlice: ((_a = process.env.ANTHROPIC_API_KEY) === null || _a === void 0 ? void 0 : _a.slice(0, 4)) + "****",
    })).slice(0, MAX_DEBUG_LENGTH);
    let retrievedContext = "";
    let isRagWorking = false;
    let ragSources = [];
    try {
        // console.log("🔍 Initiating RAG retrieval for query:", latestMessage);
        measureTime("RAG Start");
        const result = await (0, ragUtils_1.retrieveContext)(latestMessage, knowledgeBaseId);
        retrievedContext = result.context;
        isRagWorking = result.isRagWorking;
        ragSources = result.ragSources || [];
        if (!result.isRagWorking) {
            // console.warn("🚨 RAG Retrieval failed but did not throw!");
        }
        measureTime("RAG Complete");
        console.log("🔍 RAG Retrieved:", isRagWorking ? "YES" : "NO");
        console.log("✅ RAG retrieval completed successfully. Context:", retrievedContext.slice(0, 100) + "...");
    }
    catch (error) {
        console.error("💀 RAG Error:", error);
        console.error("❌ RAG retrieval failed for query:", latestMessage);
        retrievedContext = "";
        isRagWorking = false;
        ragSources = [];
    }
    measureTime("RAG Total Duration");
    const USE_CATEGORIES = true;
    const categoryListString = customer_support_categories_json_1.default.categories
        .map((c) => c.id)
        .join(", ");
    const categoriesContext = USE_CATEGORIES
        ? `
    To help with our internal classification of inquiries, we would like you to categorize inquiries in addition to answering them. We have provided you with ${customer_support_categories_json_1.default.categories.length} customer support categories.
    Check if your response fits into any category and include the category IDs in your "matched_categories" array.
    The available categories are: ${categoryListString}
    If multiple categories match, include multiple category IDs. If no categories match, return an empty array.
  `
        : "";
    const systemPrompt = ` ${context}
    ${isRagWorking
        ? `${retrievedContext}`
        : "No relevant information was found for this query."}
    Please provide answers that strictly follow the given information. If no relevant information is available, or if the context does not help to answer the query, redirect the user to a human programmer.
    ${categoriesContext}
    If the query is not related to rewriting functions or using libraries, redirect the user to a human agent.
    Structure your response as a valid JSON object in the following format:
    {
        "thinking": "Brief explanation of your reasoning to solve the problem",
        "response": "(async () => { try { let {parameter1, parameter2} = value; // Your code here } catch (error) { await util.systemError(error.message, 'functionName', { data: value }); throw error; } })();", // The function as a string with try-catch and proper formatting
        "user_mood": "positive|neutral|negative|curious|frustrated|confused",
        "suggested_questions": ["Question 1?", "Question 2?", "Question 3?"],
        "debug": {
          "context_used": true
        },
        ${USE_CATEGORIES
        ? '"matched_categories": ["category_id1", "category_id2"],'
        : ""}
        "redirect_to_agent": {
          "should_redirect": false
        }
    }`;
    try {
        //console.log(`🚀 Query Processing`);
        measureTime("Claude Generation Start");
        const anthropicMessages = messages.map((msg) => ({
            role: msg.role,
            content: msg.content,
        }));
        anthropicMessages.push({
            role: "assistant",
            content: "{",
        });
        const response = await anthropic.messages.create({
            model: model,
            max_tokens: 4000,
            messages: anthropicMessages,
            system: systemPrompt,
            temperature: 0.3,
        });
        measureTime("Claude Generation Complete");
        console.log("✅ Message generation completed");
        const textContent = "{" +
            response.content
                .filter((block) => block.type === "text")
                .map((block) => block.text)
                .join(" ")
                .replace(/[\u0000-\u001F\u007F-\u009F]/g, "");
        const parsedResponse = JSON.parse(textContent);
        const validatedResponse = responseSchema.parse(parsedResponse);
        const responseWithId = {
            id: crypto_1.default.randomUUID(),
            ...validatedResponse,
            usage: response.usage,
        };
        if ((_b = responseWithId.redirect_to_agent) === null || _b === void 0 ? void 0 : _b.should_redirect) {
            // console.log("🚨 AGENT REDIRECT TRIGGERED!");
            // console.log("Reason:", responseWithId.redirect_to_agent.reason);
        }
        res.setHeader("Content-Type", "application/json");
        if (ragSources.length > 0) {
            res.setHeader("x-rag-sources", (0, helpers_1.sanitizeHeaderValue)(JSON.stringify(ragSources)));
        }
        res.setHeader("X-Debug-Data", (0, helpers_1.sanitizeHeaderValue)(debugData));
        measureTime("API Complete");
        res.status(200).json(responseWithId);
    }
    catch (error) {
        console.error("💥 Error in message generation:", error);
        const errorResponse = {
            response: "Desculpe, houve um problema ao processar sua solicitação. Tente novamente mais tarde.",
            thinking: "Ocorreu um erro durante a geração da mensagem.",
            user_mood: "neutral",
            debug: { context_used: false },
        };
        res.status(500).json(errorResponse);
    }
}
