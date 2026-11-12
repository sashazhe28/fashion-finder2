import { GoogleGenAI, Type } from "@google/genai";
import { config } from "../config";

// The key lives only here, on the server. It is never sent to the browser.
const ai = new GoogleGenAI({ apiKey: config.gemini.apiKey });

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

const RETRYABLE = new Set([429, 500, 503]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const statusOf = (e: any): number => Number(e?.status ?? e?.code ?? e?.error?.code) || 0;

/** Preview models sometimes answer 503 "high demand": retry, then try the fallback model if set. */
async function generateWithRetry(build: (model: string) => Promise<{ text?: string }>) {
  const models = [config.gemini.model, ...(config.gemini.fallbackModel ? [config.gemini.fallbackModel] : [])];
  let lastError: unknown;
  for (const model of models) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await build(model);
      } catch (e) {
        lastError = e;
        if (!RETRYABLE.has(statusOf(e))) throw e;
        console.warn(`[gemini] ${model} attempt ${attempt + 1}: ${statusOf(e)}, retrying`);
        await sleep(800 * (attempt + 1));
      }
    }
  }
  throw lastError;
}

function parseJsonArray(text: string): unknown {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(cleaned);
}

export async function analyzeFashionImage(base64Data: string, mimeType: string, region: string): Promise<AnalyzedItem[]> {
  const language = LANGUAGE_BY_REGION[region] || "Russian";

  const response = await generateWithRetry((model) => ai.models.generateContent({
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
