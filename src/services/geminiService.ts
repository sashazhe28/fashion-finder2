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

export const getAnalysisSystemPrompt = (language: string) => `You are a visual search expert for fashion marketplaces. Analyze the image and identify up to 3 distinct items. For each item, focus **only on visible attributes (Type of item, Main Color, and Key Style/Fit)**. Generate the single, shortest, and most effective ${language} search query that accurately reflects the visual elements and will yield the highest relevance on search engines (e.g., in English: 'Red cropped cardigan'). Do not guess brand or fabric. Prefer simplicity and high relevance. You MUST respond with a JSON array structure. All descriptions and search queries MUST be in ${language}.`;

export async function analyzeFashionImage(base64Data: string, region: string = "Russia") {
  const languageMap: Record<string, string> = {
    'Russia': 'Russian',
    'USA': 'English',
    'Europe': 'English',
    'Central Asia': 'Russian' // Note: Russian is the primary language for WB/Ozon/Kaspi in Central Asia, but we could add more logic if needed.
  };

  const targetLanguage = languageMap[region] || 'Russian';

  const response = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: [
      {
        role: "user",
        parts: [
          { text: `Identify the main clothing items and accessories in this photo and provide a precise search query for each in ${targetLanguage}.` },
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
      responseSchema: {
        type: Type.ARRAY,
        description: `List of identified items in the image, up to 3. All strings must be in ${targetLanguage}.`,
        items: {
          type: Type.OBJECT,
          properties: {
            itemDescription: { 
              type: Type.STRING, 
              description: `Short, concise ${targetLanguage} description of the item focusing only on visual features.` 
            },
            searchQuery: { 
              type: Type.STRING, 
              description: `The single most effective and precise ${targetLanguage} search query for this item.` 
            }
          },
          required: ["itemDescription", "searchQuery"]
        }
      },
      systemInstruction: getAnalysisSystemPrompt(targetLanguage)
    }
  });

  if (!response.text) {
    throw new Error("No response from AI");
  }

  return JSON.parse(response.text);
}
