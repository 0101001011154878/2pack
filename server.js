// 2pack Bot Backend Server
// Handles Telegram, WhatsApp, Instagram, and TikTok messages

const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());

// ============ CONFIGURATION ============
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || "7123456789:AAF1qA...";
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN || "EAABsbCS1234...";
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID || "102030405060708";
const INSTAGRAM_TOKEN = process.env.INSTAGRAM_TOKEN || "EAABsbCS1234...";
const TIKTOK_CLIENT_KEY = process.env.TIKTOK_CLIENT_KEY || "abcdef123456";
const TIKTOK_CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET || "xyz789secret";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "sk-ant-...";

// Bot settings
const BOT_CONFIG = {
  tone: "friendly",
  language: "same",
  autoReplyRules: [
    { trigger: "price", response: "Our pricing depends on the product. Please visit our website or type the product name for a quote!" },
    { trigger: "hello", response: "Hi there! Welcome! How can I assist you today?" },
  ],
  faqList: [
    { q: "What are your opening hours?", a: "We are open Monday to Saturday, 9am to 6pm." },
    { q: "Do you offer refunds?", a: "Yes, we offer full refunds within 14 days of purchase." },
  ],
  responseInstructions: "Be helpful and friendly.",
  priceNegotiation: {
    enabled: false,
    minDiscount: 5,
    maxDiscount: 15,
    strategy: "gradual",
  }
};

// ============ HELPER: Build System Prompt ============
function buildSystemPrompt() {
  let prompt = `You are a helpful customer support assistant for 2pack.
Tone: ${BOT_CONFIG.tone}.`;

  if (BOT_CONFIG.language === "same") {
    prompt += "\nAlways reply in the same language the customer uses.";
  } else if (BOT_CONFIG.language === "en") {
    prompt += "\nAlways reply in English only.";
  } else if (BOT_CONFIG.language === "ar") {
    prompt += "\nAlways reply in Arabic only.";
  } else if (BOT_CONFIG.language === "both") {
    prompt += "\nAlways reply in both Arabic and English.";
  }

  if (BOT_CONFIG.responseInstructions) {
    prompt += `\n\nHow to respond:\n${BOT_CONFIG.responseInstructions}`;
  }

  if (BOT_CONFIG.priceNegotiation.enabled) {
    prompt += `\n\n[PRICE NEGOTIATION]\n- Minimum discount: ${BOT_CONFIG.priceNegotiation.minDiscount}%\n- Maximum discount: ${BOT_CONFIG.priceNegotiation.maxDiscount}%\n- Strategy: ${BOT_CONFIG.priceNegotiation.strategy}`;
  }

  if (BOT_CONFIG.faqList.length > 0) {
    prompt += "\n\nFAQs:\n";
    BOT_CONFIG.faqList.forEach(f => {
      prompt += `Q: ${f.q}\nA: ${f.a}\n`;
    });
  }

  prompt += "\nBe concise and helpful.";
  return prompt;
}

// ============ HELPER: Check Auto-Reply Rules ============
function checkAutoReply(message) {
  for (let rule of BOT_CONFIG.autoReplyRules) {
    if (message.toLowerCase().includes(rule.trigger.toLowerCase())) {
      return rule.response;
    }
  }
  return null;
}

// ============ HELPER: Call Claude AI ============
async function getAIResponse(userMessage, conversationHistory = []) {
  try {
    const response = await axios.post("https://api.anthropic.com/v1/messages", {
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: buildSystemPrompt(),
      messages: [
        ...conversationHistory,
        { role: "user", content: userMessage }
      ]
    }, {
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "content-type": "application/json"
      }
    });

    return response.data.content[0]?.text || "Sorry, I couldn't generate a response.";
  } catch (error) {
    console.error("Claude API error:", error.response?.data || error.message);
    return "Sorry, I'm having trouble processing your message. Please try again.";
  }
}

// ============ TELEGRAM WEBHOOK ============
app.post('/webhook/telegram', async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message || !message.text) {
      return res.send('OK');
    }

    const chatId = message.chat.id;
    const userMessage = message.text;

    console.log(`[TELEGRAM] ${message.chat.first_name}: ${userMessage}`);

    // Check auto-reply rules first
    let botResponse = checkAutoReply(userMessage);

    // If no auto-reply, use Claude AI
    if (!botResponse) {
      botResponse = await getAIResponse(userMessage);
    }

    // Send response back to Telegram
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      chat_id: chatId,
      text: botResponse,
      parse_mode: "HTML"
    });

    res.send('OK');
  } catch (error) {
    console.error('Telegram webhook error:', error.message);
    res.status(500).send('Error');
  }
});

// ============ WHATSAPP WEBHOOK ============
app.post('/webhook/whatsapp', async (req, res) => {
  try {
    const { entry } = req.body;

    if (!entry || !entry[0]?.changes[0]?.value?.messages) {
      return res.send('OK');
    }

    const messages = entry[0].changes[0].value.messages;
    const contacts = entry[0].changes[0].value.contacts;

    for (let message of messages) {
      const phoneNumber = message.from;
      const userMessage = message.text?.body;
      const contactName = contacts?.[0]?.profile?.name || "Customer";

      console.log(`[WHATSAPP] ${contactName} (${phoneNumber}): ${userMessage}`);

      if (!userMessage) continue;

      // Check auto-reply rules
      let botResponse = checkAutoReply(userMessage);

      // If no auto-reply, use Claude AI
      if (!botResponse) {
        botResponse = await getAIResponse(userMessage);
      }

      // Send response back to WhatsApp
      await axios.post(
        `https://graph.instagram.com/v18.0/${WHATSAPP_PHONE_ID}/messages`,
        {
          messaging_product: "whatsapp",
          to: phoneNumber,
          type: "text",
          text: { body: botResponse }
        },
        {
          headers: {
            "Authorization": `Bearer ${WHATSAPP_TOKEN}`,
            "Content-Type": "application/json"
          }
        }
      );
    }

    res.send('OK');
  } catch (error) {
    console.error('WhatsApp webhook error:', error.message);
    res.status(500).send('Error');
  }
});

// WhatsApp Webhook Verification
app.get('/webhook/whatsapp', (req, res) => {
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || "my_whatsapp_token_12345";
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token) {
    if (mode === 'subscribe' && token === verifyToken) {
      console.log('WhatsApp webhook verified');
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  } else {
    res.sendStatus(403);
  }
});

// ============ INSTAGRAM WEBHOOK ============
app.post('/webhook/instagram', async (req, res) => {
  try {
    const { entry } = req.body;

    if (!entry || !entry[0]?.messaging) {
      return res.send('OK');
    }

    for (let event of entry[0].messaging) {
      if (!event.message || !event.message.text) continue;

      const senderId = event.sender.id;
      const userMessage = event.message.text;

      console.log(`[INSTAGRAM] User ${senderId}: ${userMessage}`);

      // Check auto-reply rules
      let botResponse = checkAutoReply(userMessage);

      // If no auto-reply, use Claude AI
      if (!botResponse) {
        botResponse = await getAIResponse(userMessage);
      }

      // Send response back to Instagram
      await axios.post(
        `https://graph.instagram.com/v18.0/me/messages`,
        {
          recipient: { id: senderId },
          message: { text: botResponse }
        },
        {
          headers: {
            "Authorization": `Bearer ${INSTAGRAM_TOKEN}`,
            "Content-Type": "application/json"
          }
        }
      );
    }

    res.send('OK');
  } catch (error) {
    console.error('Instagram webhook error:', error.message);
    res.status(500).send('Error');
  }
});

// Instagram Webhook Verification
app.get('/webhook/instagram', (req, res) => {
  const verifyToken = process.env.INSTAGRAM_VERIFY_TOKEN || "my_instagram_token_12345";
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token) {
    if (mode === 'subscribe' && token === verifyToken) {
      console.log('Instagram webhook verified');
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  } else {
    res.sendStatus(403);
  }
});

// ============ TIKTOK WEBHOOK ============
app.post('/webhook/tiktok', async (req, res) => {
  try {
    const { data } = req.body;

    if (!data || !data.content) {
      return res.send('OK');
    }

    const userMessage = data.content;
    const conversationId = data.conversation_id;
    const userId = data.user_id;

    console.log(`[TIKTOK] User ${userId}: ${userMessage}`);

    // Check auto-reply rules
    let botResponse = checkAutoReply(userMessage);

    // If no auto-reply, use Claude AI
    if (!botResponse) {
      botResponse = await getAIResponse(userMessage);
    }

    // Send response back to TikTok
    await axios.post(
      `https://open-api.tiktok.com/v1/chat/message/send`,
      {
        conversation_id: conversationId,
        content: botResponse
      },
      {
        headers: {
          "Authorization": `Bearer ${process.env.TIKTOK_ACCESS_TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );

    res.send('OK');
  } catch (error) {
    console.error('TikTok webhook error:', error.message);
    res.status(500).send('Error');
  }
});

// TikTok Webhook Verification
app.get('/webhook/tiktok', (req, res) => {
  const verifyCode = process.env.TIKTOK_VERIFY_CODE || "my_tiktok_token_12345";
  const code = req.query.code;
  const challenge = req.query.challenge;

  if (code === verifyCode) {
    console.log('TikTok webhook verified');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// ============ HEALTH CHECK ============
app.get('/health', (req, res) => {
  res.json({ status: 'Server is running', timestamp: new Date() });
});

// ============ START SERVER ============
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🤖 2pack Bot Server running on port ${PORT}`);
  console.log(`Telegram: POST https://yourdomain.com/webhook/telegram`);
  console.log(`WhatsApp: POST https://yourdomain.com/webhook/whatsapp`);
  console.log(`Instagram: POST https://yourdomain.com/webhook/instagram`);
  console.log(`TikTok: POST https://yourdomain.com/webhook/tiktok`);
});
