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
    const { messages, model, knowledgeBaseId } = req.body;
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
    const systemPrompt = `Você é um assistente de programação especializado em JavaScript.
    Sua principal função é escrever e reescrever funções de programação com base nos exemplos fornecidos.
    Siga rigorosamente as diretrizes abaixo para cada função:

    1. **Parâmetros**: Extraia os parâmetros do objeto "value" usando destructuring, garantindo que todos os valores necessários sejam obtidos de forma clara e organizada.
       Utilize \`let { context } = value\` para garantir que o contexto seja extraído corretamente.

    2. **Bibliotecas**: Utilize as bibliotecas disponíveis no objeto "util" para operações específicas. Aqui estão alguns exemplos:
      - Para requisições HTTP, utilize \`util.axios\`.
      - Para manipulação de datas, utilize \`util.moment\`.

    3. **Autoexecução**: Todas as funções devem ser autoexecutáveis (IIFE) e começar com a seguinte estrutura: \`(async () => { // código }\)();\`. Certifique-se de que a função seja envolvida dessa maneira para garantir a execução imediata após a definição.

    4. **Execução de Outras Funções**: Ao executar outra função, utilize o formato util.execFunc(). O primeiro parâmetro é o nome da função e o segundo é um objeto contendo os parâmetros que essa função deve receber. Exemplo:
      await util.execFunc('nomeDaFuncao', { parametro1: valor1, parametro2: valor2 });

    5. **Resposta em String**: As funções geradas devem ser incluídas no campo "response" como uma string válida, começando sempre com \`(async () => {...})()\`, para que possam ser interpretadas e executadas posteriormente.

    6. **Consultas e Inserções no Banco de Dados**: Ao realizar operações no banco de dados, utilize o formato:
       \`await util.database("nome_da_tabela", context.db).metodo({ ...value });\`.

       Os principais métodos do MongoDB são:
       - **Inserção de um documento**: Use \`insertOne\` para adicionar um único elemento:
         \`await util.database("nome_da_tabela", context.db).insertOne({ ...value, __created: new Date() });\`
       - **Inserção de múltiplos documentos**: Use \`insertMany\` para adicionar vários elementos:
         \`await util.database("nome_da_tabela", context.db).insertMany([{ ...value, __created: new Date() }, { ...outroValor }]);\`
       - **Atualização de um documento**: Use \`updateOne\` para atualizar um único documento:
         \`await util.database("nome_da_tabela", context.db).updateOne({ ...value });\`
       - **Atualização de múltiplos documentos**: Use \`updateMany\` para atualizar vários documentos:
         \`await util.database("nome_da_tabela", context.db).updateMany({ ...value });\`
       - **Exclusão de um documento**: Use \`deleteOne\` para remover um único documento:
         \`await util.database("nome_da_tabela", context.db).deleteOne({ ...value });\`
       - **Exclusão de múltiplos documentos**: Use \`deleteMany\` para remover vários documentos:
         \`await util.database("nome_da_tabela", context.db).deleteMany({ ...value });\`
       - **Consultas com múltiplos resultados**: Para consultas que retornam múltiplos documentos, como \`find\` e \`aggregate\`, certifique-se de usar o método \`toArray\` para converter os resultados em um array:
         \`await util.database("nome_da_tabela", context.db).find({ ...query }).toArray();\`
         \`await util.database("nome_da_tabela", context.db).aggregate([{ ...pipeline }]).toArray();\`

       Certifique-se de adicionar o campo \`__created: new Date()\` **apenas** nas operações de inserção (\`insertOne\` e \`insertMany\`).

    A seguir, o contexto relevante recuperado pelo sistema de RAG, que pode ou não ser útil para responder à solicitação do usuário:
    ${isRagWorking
        ? `${retrievedContext}`
        : "Nenhuma informação relevante foi encontrada para esta consulta."}

    Por favor, forneça respostas que sigam estritamente as informações fornecidas. Se não houver informações relevantes, ou se o contexto não ajudar a responder à consulta, redirecione o usuário para um programador humano.

    ${categoriesContext}

    Se a consulta não for relacionada à reescrita de funções ou uso de bibliotecas, redirecione o usuário a um agente humano.

    Estruture sua resposta como um objeto JSON válido no seguinte formato:
    {
        "thinking": "Breve explicação do seu raciocínio para resolver o problema",
        "response": "(async () => { // Seu código aqui })();", // A função como string
        "user_mood": "positive|neutral|negative|curious|frustrated|confused",
        "suggested_questions": ["Pergunta 1?", "Pergunta 2?", "Pergunta 3?"],
        "debug": {
          "context_used": true|false
        },
        ${USE_CATEGORIES
        ? '"matched_categories": ["category_id1", "category_id2"],'
        : ""}
        "redirect_to_agent": {
          "should_redirect": boolean,
          "reason": "Motivo do redirecionamento (incluir apenas se should_redirect for true)"
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
            max_tokens: 1000,
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
