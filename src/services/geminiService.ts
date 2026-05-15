import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });

export const MODEL_NAME = "gemini-3-flash-preview";

export const ITEM_SCHEMA = {
  type: Type.ARRAY,
  description: "List of identified items in the image, up to 3.",
  items: {
    type: Type.OBJECT,
    properties: {
      itemDescription: { 
        type: Type.STRING, 
        description: "Short, concise Russian description of the item focusing only on visual features (e.g., 'Белая футболка оверсайз')." 
      },
      searchQuery: { 
        type: Type.STRING, 
        description: "The single most effective and precise Russian search query for this item (e.g., 'Белая хлопковая футболка оверсайз')." 
      }
    },
    required: ["itemDescription", "searchQuery"]
  }
};

export const ANALYSIS_SYSTEM_PROMPT = "You are a visual search expert for fashion marketplaces. Analyze the image and identify up to 3 distinct items. For each item, focus **only on visible attributes (Type of item, Main Color, and Key Style/Fit)**. Generate the single, shortest, and most effective Russian search query that accurately reflects the visual elements and will yield the highest relevance on search engines (e.g., 'Красный укороченный кардиган'). Do not guess brand or fabric. Prefer simplicity and high relevance. You MUST respond with a JSON array structure.";

export async function analyzeFashionImage(base64Data: string) {
  const response = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: [
      {
        role: "user",
        parts: [
          { text: "Identify the main clothing items and accessories in this photo and provide a precise search query for each." },
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: base64Data
            }
          }
        ]
      }
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: ITEM_SCHEMA,
      systemInstruction: ANALYSIS_SYSTEM_PROMPT
    }
  });

  if (!response.text) {
    throw new Error("No response from AI");
  }

  return JSON.parse(response.text);
}
