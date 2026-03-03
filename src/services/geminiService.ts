import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function translateContent(
  content: string,
  targetLang: string,
  sourceLang: string = "auto",
  fileData?: { data: string; mimeType: string }
) {
  const model = "gemini-3-flash-preview";
  
  const parts: any[] = [];
  
  if (fileData) {
    parts.push({
      inlineData: {
        data: fileData.data.split(',')[1] || fileData.data,
        mimeType: fileData.mimeType
      }
    });
  }

  const prompt = `Translate the following content to ${targetLang}. 
  If it's an image or document, describe it and translate any text found within it to ${targetLang}.
  Original language: ${sourceLang}.
  Content: ${content || "See attached file"}`;

  parts.push({ text: prompt });

  try {
    const response = await ai.models.generateContent({
      model,
      contents: [{ parts }],
      config: {
        temperature: 0.1,
      }
    });

    return response.text;
  } catch (error) {
    console.error("Translation error:", error);
    return content; // Fallback to original
  }
}

export const LANGUAGES = [
  { code: 'pt', name: 'Português' },
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Español' },
  { code: 'fr', name: 'Français' },
  { code: 'de', name: 'Deutsch' },
  { code: 'it', name: 'Italiano' },
  { code: 'ja', name: '日本語' },
  { code: 'ko', name: '한국어' },
  { code: 'zh', name: '中文 (Mandarim)' },
  { code: 'ru', name: 'Русский' },
  { code: 'ar', name: 'العربية (Árabe)' },
  { code: 'hi', name: 'हिन्दी (Hindi)' },
  { code: 'tr', name: 'Türkçe' },
  { code: 'nl', name: 'Nederlands' },
  { code: 'vi', name: 'Tiếng Việt' },
];
