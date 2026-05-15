import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // Database setup
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  // Initialize DB table
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS search_history (
        id SERIAL PRIMARY KEY,
        images_base64 TEXT,
        results JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("Database initialized");
  } catch (err) {
    console.error("Database initialization failed", err);
  }

  // Gemini setup
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
  const MODEL_NAME = "gemini-3-flash-preview";

  const ITEM_SCHEMA = {
    type: Type.ARRAY,
    description: "List of identified items in the image, up to 3.",
    items: {
      type: Type.OBJECT,
      properties: {
        itemDescription: { 
          type: Type.STRING, 
          description: "Short, concise Russian description of the item focusing only on visual features." 
        },
        searchQuery: { 
          type: Type.STRING, 
          description: "The single most effective and precise Russian search query for this item." 
        }
      },
      required: ["itemDescription", "searchQuery"]
    }
  };

  const ANALYSIS_SYSTEM_PROMPT = "You are a visual search expert for fashion marketplaces. Analyze the image and identify up to 3 distinct items. For each item, focus **only on visible attributes (Type of item, Main Color, and Key Style/Fit)**. Generate the single, shortest, and most effective Russian search query that accurately reflects the visual elements. Respond with a JSON array.";

  // API Routes
  app.post("/api/analyze", async (req, res) => {
    const { image } = req.body;
    if (!image) {
      return res.status(400).json({ error: "Image is required" });
    }

    try {
      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: [
          {
            role: "user",
            parts: [
              { text: "Identify the main clothing items in this photo and provide a search query for each." },
              {
                inlineData: {
                  mimeType: "image/jpeg",
                  data: image
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

      const analysisRaw = response.text;
      if (!analysisRaw) {
        throw new Error("AI returned an empty response. This might be due to safety filters or an invalid image.");
      }

      const analysis = JSON.parse(analysisRaw);
      
      // Save to history (non-blocking)
      pool.query(
        "INSERT INTO search_history (results) VALUES ($1)",
        [JSON.stringify(analysis)]
      ).catch(err => console.error("Failed to save history:", err));

      res.json(analysis);
    } catch (error: any) {
      console.error("Detailed Gemini Error:", error);
      const message = error.response?.data?.error?.message || error.message || "An unknown error occurred during analysis";
      res.status(500).json({ error: message });
    }
  });

  app.get("/api/history", async (req, res) => {
    try {
      const { rows } = await pool.query("SELECT * FROM search_history ORDER BY created_at DESC LIMIT 10");
      res.json(rows);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
