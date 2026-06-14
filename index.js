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
  address: 'https://maps.app.goo.gl/8J9ttWcARmAWw4r78',
  phone:   '+20 10 99595956',
  hours:   'كل الايام من الساعه 1 م حتي الساعه 11 م عدا يوم الجمعة',
};

const SERVICES = `
- كشف وفحص: ٧٠٠ جنيه
- تنظيف الجير مع التلميع: ١٨٠٠ جنيه
- حشو عادي: ٢٠٠٠ جنيه
- حشو عصب مع طربوش: ٦٠٠٠ جنيه
- خلع سن عادي: ١٠٠٠ جنيه
- خلع جراحي: ٢٠٠٠ جنيه
- كوبري: من ٦٠٠٠ إلى ١٠٠٠٠ جنيه حسب الحالة
- زراعة سن: من ١٥٠٠٠ إلى ٢٥٠٠٠ جنيه
- تقويم أسنان: حسب خطة العلاج
- زراعة الفك الكامل: تكلفة تصل لـ ١٣٠٠٠٠ جنيه وتختلف من حالة لأخرى (غير شاملة التركيبة)
`;

const SYSTEM_PROMPT = `أنت مساعدة ذكية تمثلين المركز الملكي للأسنان. اسمك "دكتورة مي" 🦷

معلومات المركز:
- الموقع: ${CLINIC.address}
- التليفون: ${CLINIC.phone}
- مواعيد العمل: ${CLINIC.hours}

الخدمات والأسعار:
${SERVICES}

تعليمات مهمة جداً:
- تكلمي المريض باللغة العربية الفصحى البسيطة بأسلوب ودي ومحترم
- لا تستخدمي عامية أو كلمات إنجليزية
- لو المريض أراد حجز موعد، اطلبي منه: الاسم الكريم، رقم الهاتف، الخدمة المطلوبة، واليوم والوقت المناسب
- لو المريض يشكو من ألم، تعاطفي معه واقترحي له حجز موعد عاجل
- لو سأل عن سعر، أخبريه بالسعر من القائمة بدقة
- لو اكتملت بيانات الحجز، قولي له: "تم استلام طلب حجزكم وسيتم التواصل معكم خلال ٣٠ دقيقة لتأكيد الموعد"
- ردودك تكون مختصرة ومفيدة، لا تتجاوز ٣ أسطر
- بالنسبة لزراعة الفك الكامل، وضحي أن التكلفة تختلف من حالة لأخرى وقد تصل إلى ١٣٠٠٠٠ جنيه للزراعة فقط، غير شاملة التركيبة
- استخدمي إيموجي بشكل لطيف 😊`;

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
