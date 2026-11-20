const { GoogleGenerativeAI } = require('@google/generative-ai');

let genAI = null;
const apiKey = process.env.GEMINI_API_KEY;

if (apiKey && apiKey !== 'your_gemini_api_key_here' && apiKey.length > 10) {
  genAI = new GoogleGenerativeAI(apiKey);
}

const SYSTEM_INSTRUCTION = `You are HeirFlow's AI estate planning assistant. HeirFlow is a digital estate management platform that helps users catalog their assets (bank accounts, crypto, subscriptions, property, files, social media), assign nominees/beneficiaries, and manage the inheritance claim process.

Your role is to provide helpful, accurate, and empathetic guidance about:
- Digital estate planning & digital legacy
- Asset documentation best practices (financial, digital accounts, crypto)
- Nominee selection, key-sharing, and quorum rules
- The HeirFlow claim, 7-day grace period, and verification process
- Legal considerations and estate administration
- Security best practices

Keep responses concise (2-3 paragraphs max), practical, and specific to the user's question.`;

/**
 * Generate chat response using Google Gemini 1.5 Flash
 */
async function generateChatResponse(message, context = '') {
  if (!genAI) {
    return null; // Fallback to mock
  }

  const model = genAI.getGenerativeModel({
    model: 'gemini-1.5-flash',
    systemInstruction: SYSTEM_INSTRUCTION,
  });

  const prompt = context
    ? `Context: ${context}\n\nUser Question: ${message}`
    : message;

  const result = await model.generateContent(prompt);
  const response = await result.response;
  return response.text();
}

/**
 * Multimodal document analysis using Gemini Vision
 * Analyzes death certificates, wills, or estate documentation
 */
async function analyzeDocument(buffer, mimeType, documentType = 'death_certificate') {
  if (!genAI) {
    return {
      verified: true,
      document_type: documentType,
      extracted_data: {
        summary: 'Demo document verification (configure GEMINI_API_KEY for live AI extraction)',
        confidence_score: 0.95,
      },
      source: 'heuristic',
    };
  }

  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  const prompt = `You are an expert document verification AI for HeirFlow estate platform.
Analyze this uploaded ${documentType.replace('_', ' ')}:
1. Identify the document type and issuing authority.
2. Extract key entities: Full Name of Individual, Date of Event/Death, Certificate or Document ID Number, Place of Issuance.
3. Check for signs of authenticity or missing mandatory stamps/seals.
4. Output a concise JSON object with:
   - "document_type": string
   - "individual_name": string
   - "event_date": string
   - "document_id": string
   - "authenticity_confidence": number (between 0.0 and 1.0)
   - "summary": string
Return ONLY the raw JSON without markdown code fences.`;

  const part = {
    inlineData: {
      data: buffer.toString('base64'),
      mimeType: mimeType,
    },
  };

  const result = await model.generateContent([prompt, part]);
  const text = (await result.response).text().trim();

  try {
    const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
    return {
      verified: true,
      extracted_data: JSON.parse(cleaned),
      source: 'gemini-1.5-flash',
    };
  } catch (err) {
    return {
      verified: true,
      raw_text: text,
      source: 'gemini-1.5-flash',
    };
  }
}

module.exports = {
  generateChatResponse,
  analyzeDocument,
  isGeminiConfigured: () => Boolean(genAI),
};

