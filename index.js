const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

// ═══════════════════════════════════════════
//  المتغيرات من Railway
// ═══════════════════════════════════════════
const ID_INSTANCE     = process.env.ID_INSTANCE;
const API_TOKEN       = process.env.API_TOKEN;
const ANTHROPIC_KEY   = process.env.ANTHROPIC_API_KEY;

// ═══════════════════════════════════════════
//  بيانات العيادة
// ═══════════════════════════════════════════
const CLINIC = {
  name:    'المركز الملكي للأسنان',
  address: '٢٣ شارع التحرير، الدور الثالث، المهندسين، الجيزة',
  phone:   '٠١٢٣-٤٥٦-٧٨٩',
  hours:   'السبت – الخميس: ١٠ص – ٩م | الجمعة: ٤ع – ٩م',
};

const SERVICES = `
- حشو الأسنان: من ٢٠٠ إلى ٤٠٠ جنيه
- تبييض الأسنان: من ٨٠٠ إلى ١٢٠٠ جنيه
- تركيب كراون: من ١٥٠٠ إلى ٣٠٠٠ جنيه
- زراعة أسنان: من ٥٠٠٠ إلى ٨٠٠٠ جنيه
- تقويم أسنان: من ٤٠٠٠ إلى ٧٠٠٠ جنيه
- كشف وتنظيف: ١٥٠ جنيه
- قلع أسنان: من ٢٠٠ إلى ٥٠٠ جنيه
`;

const SYSTEM_PROMPT = `أنت مساعد ذكي لـ "${CLINIC.name}". اسمك "دكتور بوت" 🦷

معلومات العيادة:
- العنوان: ${CLINIC.address}
- التليفون: ${CLINIC.phone}
- مواعيد العمل: ${CLINIC.hours}

الخدمات والأسعار:
${SERVICES}

تعليمات مهمة:
- تكلم المريض بالعربي العامية المصرية بشكل ودي ومريح
- لو المريض عايز يحجز موعد، اطلب منه: الاسم، رقم الموبايل، الخدمة، التاريخ والوقت المناسب
- لو المريض عنده ألم أو مشكلة، تعاطف معاه واقترحله يحجز موعد طوارئ
- لو سألك عن سعر، قوله السعر من القائمة
- لو خلصت بيانات الحجز كلها، قوله "تم استلام طلب حجزك وهنتصل بيك خلال ٣٠ دقيقة للتأكيد"
- ردودك تكون قصيرة ومفيدة، مش أكتر من ٣ أسطر
- استخدم إيموجي بشكل معقول 😊`;

// ═══════════════════════════════════════════
//  تاريخ المحادثات
// ═══════════════════════════════════════════
const conversations = {};

// ═══════════════════════════════════════════
//  إرسال رسالة لـ Green API
// ═══════════════════════════════════════════
async function sendMessage(chatId, message) {
  try {
    const url = `https://7107.api.greenapi.com/waInstance${ID_INSTANCE}/sendMessage/${API_TOKEN}`;
    await axios.post(url, { chatId, message }, {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('خطأ في الإرسال:', err.message);
  }
}

// ═══════════════════════════════════════════
//  Claude AI
// ═══════════════════════════════════════════
async function askClaude(chatId, userMessage) {
  if (!conversations[chatId]) conversations[chatId] = [];

  conversations[chatId].push({ role: 'user', content: userMessage });

  // احتفظ بآخر ١٠ رسائل بس عشان متتقلش
  if (conversations[chatId].length > 20) {
    conversations[chatId] = conversations[chatId].slice(-20);
  }

  try {
    const response = await axios.post('https://api.anthropic.com/v1/messages', {
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      system: SYSTEM_PROMPT,
      messages: conversations[chatId],
    }, {
      headers: {
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      }
    });

    const reply = response.data.content[0].text;
    conversations[chatId].push({ role: 'assistant', content: reply });
    return reply;

  } catch (err) {
    console.error('خطأ في Claude:', err.message);
    return 'معلش في مشكلة مؤقتة، حاول تاني بعد شوية 😅';
  }
}

// ═══════════════════════════════════════════
//  Webhook
// ═══════════════════════════════════════════
app.post('/webhook', async (req, res) => {
  res.sendStatus(200);
  const body = req.body;
  if (body.typeWebhook !== 'incomingMessageReceived') return;

  const chatId = body.senderData?.chatId;
  const text   = body.messageData?.textMessageData?.textMessage;
  if (!chatId || !text) return;

  console.log(`📩 رسالة من ${chatId}: ${text}`);

  const reply = await askClaude(chatId, text);
  console.log(`🤖 رد البوت: ${reply}`);
  await sendMessage(chatId, reply);
});

app.get('/', (req, res) => res.send('🦷 المركز الملكي للأسنان - البوت شغال!'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ البوت شغال على بورت ${PORT}`));
