const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');

const MOCK_RESPONSES = {
  assets: [
    "For digital assets like cryptocurrency, I recommend documenting wallet addresses, exchange accounts, and recovery phrases in a secure, encrypted location that your nominees can access. Consider hardware wallets with clearly documented recovery procedures.",
    "Bank accounts typically have a Transfer on Death (TOD) or Payable on Death (POD) designation option — this is one of the simplest ways to pass financial assets without probate. Contact your bank to set this up alongside your HeirFlow asset documentation.",
    "When cataloging property assets, include the property deed location, mortgage details, insurance policy numbers, and any outstanding liens. Your nominee should know exactly what documents to gather for the transfer process."
  ],
  nominees: [
    "When choosing nominees, consider selecting people who are financially responsible, geographically accessible, and trustworthy enough to manage potentially complex asset transfers. It's wise to have at least one backup nominee in case your primary can't serve.",
    "In HeirFlow's system, each nominee receives a unique key share — a component of a cryptographic verification system. This ensures multiple nominees must cooperate for major asset transfers, preventing any single person from acting unilaterally.",
    "Consider your nominees' technical ability when assigning specific assets. A tech-savvy nominee should handle cryptocurrency and digital accounts, while a financially experienced person is better suited for bank accounts and property transfers."
  ],
  claims: [
    "The claim process in HeirFlow follows a structured flow: initial submission → document review → 7-day grace period → execution. The grace period allows time for any disputes or errors to be caught before irreversible actions are taken.",
    "When initiating a claim, nominees should gather: the death certificate, their government-issued ID, proof of relationship to the deceased, and any specific documents mentioned in the asset instructions. The more documentation provided upfront, the smoother the review process.",
    "During the grace period, family members or other stakeholders can raise concerns about the claim. This is a critical safeguard against fraudulent claims. If you believe a claim is fraudulent, contact your legal counsel immediately."
  ],
  planning: [
    "Estate planning is not just for the wealthy — everyone with digital accounts, subscriptions, or any assets should have a plan. The average person has 90+ digital accounts, most of which will become inaccessible without proper documentation.",
    "A complete estate plan includes: a will, healthcare directives, power of attorney, beneficiary designations on all accounts, and a digital estate plan like HeirFlow. Each serves a different purpose and they work together to protect your legacy.",
    "Review and update your estate plan after major life events: marriage, divorce, birth of children, purchasing property, starting a business, or significant changes in your financial situation. HeirFlow makes this easy with our asset and nominee management system."
  ],
  security: [
    "HeirFlow uses a distributed key system inspired by Shamir's Secret Sharing — your estate access is split across multiple nominees, so no single person has complete control. This balances security with accessibility.",
    "Never store passwords or recovery phrases in plain text in your asset details. Instead, reference where the secure storage is located (e.g., 'Recovery phrase is in my physical safe, combination is in the sealed envelope with my attorney').",
    "For maximum security, consider using a password manager with an emergency access feature for digital accounts, combined with HeirFlow for the master documentation and coordination layer."
  ]
};

function getMockResponse(message) {
  const lower = message.toLowerCase();
  
  let category = 'planning';
  if (lower.includes('asset') || lower.includes('bank') || lower.includes('crypto') || lower.includes('property')) {
    category = 'assets';
  } else if (lower.includes('nominee') || lower.includes('beneficiary') || lower.includes('heir')) {
    category = 'nominees';
  } else if (lower.includes('claim') || lower.includes('death') || lower.includes('deceased') || lower.includes('inherit')) {
    category = 'claims';
  } else if (lower.includes('security') || lower.includes('password') || lower.includes('key') || lower.includes('safe')) {
    category = 'security';
  }

  const responses = MOCK_RESPONSES[category];
  const response = responses[Math.floor(Math.random() * responses.length)];
  
  return response;
}

// POST /api/gemini/chat
router.post('/chat', auth, async (req, res) => {
  try {
    const { message, context } = req.body;
    if (!message) {
      return res.status(400).json({ success: false, error: 'message is required' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    const hasRealKey = apiKey && apiKey !== 'your_gemini_api_key_here' && apiKey.length > 10;

    if (hasRealKey) {
      // Call real Gemini API
      try {
        const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
        const systemPrompt = `You are HeirFlow's AI estate planning assistant. HeirFlow is a digital estate management platform that helps users catalog their assets (bank accounts, crypto, subscriptions, property, files, social media), assign nominees/beneficiaries, and manage the inheritance claim process.

Your role is to provide helpful, accurate, and empathetic guidance about:
- Digital estate planning
- Asset documentation best practices
- Nominee selection and management
- The HeirFlow claim and verification process
- Legal considerations (without giving specific legal advice)
- Security best practices for digital assets

Context: ${context || 'General estate planning conversation'}

Keep responses concise (2-3 paragraphs max), practical, and specific to the user's question.`;

        const payload = {
          contents: [
            {
              role: 'user',
              parts: [{ text: `${systemPrompt}\n\nUser question: ${message}` }]
            }
          ],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 500
          }
        };

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          }
        );

        if (!response.ok) {
          throw new Error(`Gemini API error: ${response.status}`);
        }

        const data = await response.json();
        const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || getMockResponse(message);
        
        return res.json({ success: true, data: { reply, source: 'gemini' } });
      } catch (apiErr) {
        console.warn('Gemini API call failed, using mock:', apiErr.message);
        // Fall through to mock
      }
    }

    // Mock response
    const reply = getMockResponse(message);
    return res.json({
      success: true,
      data: {
        reply,
        source: 'mock',
        note: 'Set a valid GEMINI_API_KEY in .env to enable AI-powered responses'
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

