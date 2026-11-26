import { GoogleGenAI, Type } from "@google/genai";
import { config } from "../config";

// The key lives only here, on the server. It is never sent to the browser.
// Optional gateway (e.g. Cloudflare AI Gateway) in front of the Gemini API
const httpOptions = config.gemini.baseUrl
  ? {
      baseUrl: config.gemini.baseUrl,
      ...(config.gemini.gatewayToken ? { headers: { "cf-aig-authorization": `Bearer ${config.gemini.gatewayToken}` } } : {}),
    }
  : undefined;

const ai = new GoogleGenAI({ apiKey: config.gemini.apiKey, ...(httpOptions ? { httpOptions } : {}) });

const LANGUAGE_BY_REGION: Record<string, string> = {
  Russia: "Russian",
  USA: "English",
  Europe: "English",
  "Central Asia": "Russian",
};

export interface AnalyzedItem {
  itemDescription: string;
  searchQuery: string;
}

const systemPrompt = (language: string) =>
  `You are a visual search expert for fashion marketplaces. Analyze the image and identify up to 3 distinct items. For each item, focus **only on visible attributes (Type of item, Main Color, and Key Style/Fit)**. Generate the single, shortest, and most effective ${language} search query that accurately reflects the visual elements and will yield the highest relevance on search engines (e.g., in English: 'Red cropped cardigan'). Do not guess brand or fabric. Prefer simplicity and high relevance. You MUST respond with a JSON array structure. All descriptions and search queries MUST be in ${language}.`;

// Errors after which the next model is tried (overload, quota, model gone)
const NEXT_MODEL = new Set([404, 429, 500, 503, 504]);
// nginx waits 60 s for the answer: everything must fit in TOTAL_BUDGET_MS
const ATTEMPT_TIMEOUT_MS = 20_000;
const TOTAL_BUDGET_MS = 50_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const statusOf = (e: any): number => Number(e?.status ?? e?.code ?? e?.error?.code) || 0;

/** All models are overloaded or silent: the API answers 503 with a clear message. */
export class AiUnavailableError extends Error {}

/**
 * Models sometimes answer 503 "high demand" or hang without answering.
 * Either way the next model from the list is tried at once; the list is gone through twice while time is left.
 */
async function generateWithFallback(build: (model: string, signal: AbortSignal) => Promise<{ text?: string }>) {
  const models = [config.gemini.model, ...config.gemini.fallbackModels.filter((m) => m !== config.gemini.model)];
  const started = Date.now();
  let lastError: unknown;
  for (let pass = 0; pass < 2; pass++) {
    for (const model of models) {
      const left = TOTAL_BUDGET_MS - (Date.now() - started);
      if (left < 3_000) break;
      const ctl = new AbortController();
      const timeout = Math.min(ATTEMPT_TIMEOUT_MS, left);
      const timer = setTimeout(() => ctl.abort(), timeout);
      try {
        return await build(model, ctl.signal);
      } catch (e) {
        lastError = e;
        if (ctl.signal.aborted) {
          console.warn(`[gemini] ${model}: no answer in ${Math.round(timeout / 1000)}s, next model`);
        } else if (NEXT_MODEL.has(statusOf(e))) {
          console.warn(`[gemini] ${model}: ${statusOf(e)}, next model`);
        } else {
          throw e;
        }
      } finally {
        clearTimeout(timer);
      }
    }
    if (pass === 0) await sleep(1_500);
  }
  const reason = (lastError as any)?.message ?? String(lastError);
  throw new AiUnavailableError(`all Gemini models failed: ${String(reason).slice(0, 200)}`);
}

function parseJsonArray(text: string): unknown {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(cleaned);
}

export async function analyzeFashionImage(base64Data: string, mimeType: string, region: string): Promise<AnalyzedItem[]> {
  const language = LANGUAGE_BY_REGION[region] || "Russian";

  const response = await generateWithFallback((model, abortSignal) => ai.models.generateContent({
    model,
    contents: [
      {
        role: "user",
        parts: [
          { text: `Identify the main clothing items and accessories in this photo and provide a precise search query for each in ${language}.` },
          { inlineData: { mimeType, data: base64Data } },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        description: `List of identified items in the image, up to 3. All strings must be in ${language}.`,
        items: {
          type: Type.OBJECT,
          properties: {
            itemDescription: {
              type: Type.STRING,
              description: `Short, concise ${language} description of the item focusing only on visual features.`,
            },
            searchQuery: {
              type: Type.STRING,
              description: `The single most effective and precise ${language} search query for this item.`,
            },
          },
          required: ["itemDescription", "searchQuery"],
        },
      },
      systemInstruction: systemPrompt(language),
      abortSignal,
    },
  }));

  if (!response.text) throw new Error("Empty response from Gemini");
  const parsed = parseJsonArray(response.text);
  if (!Array.isArray(parsed)) throw new Error("Unexpected Gemini response format");

  return parsed
    .filter((x) => x && typeof x.itemDescription === "string" && typeof x.searchQuery === "string")
    .slice(0, 3)
    .map((x) => ({ itemDescription: x.itemDescription, searchQuery: x.searchQuery }));
}
