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
const CLINIC_PHONE    = '201099595956@c.us'; // رقم العيادة لاستقبال إشعارات الحجز

// ═══════════════════════════════════════════
//  بيانات العيادة
// ═══════════════════════════════════════════
const CLINIC = {
  name:    'المركز الملكي للأسنان',
  address: 'https://maps.app.goo.gl/8J9ttWcARmAWw4r78',
  phone:   '+20 10 99595956',
  hours:   'كل الأيام من ١ ظهراً لـ ١١ مساءً',
};

const SERVICES_LIST = `
- كشف وفحص
- تنظيف الجير مع التلميع
- حشو عادي
- حشو عصب مع طربوش
- خلع سن عادي
- خلع جراحي
- كوبري
- زراعة سن
- تقويم أسنان
- زراعة الفك الكامل
`;

const PRICES_LIST = `
- كشف وفحص: 500 جنيه
- تنظيف الجير مع التلميع: 1350 جنيه
- حشو تجميلي: 1750 جنيه
- حشو عادي: 1350 جنيه
- حشو عصب : 4850 جنيه
- خلع سن عادي: 500 جنيه
- خلع جراحي: 3000 جنيه
- طربوش : من 3750 إلى 7500 جنيه حسب النوع
-  القشره التجميليه : من 6500 إلى 8500 جنيه حسب النوع
- تبييض الأسنان: 2500 جنيه
- قص و تجميل اللثه مع العضم للسن الواحد: 650 جنيه
- زراعة سن: من ١٥٠٠٠ إلى ٢٥٠٠٠ جنيه
- تقويم أسنان: حسب خطة العلاج
- زراعة الفك الكامل: تكلفة تصل لـ ١٣٠٠٠٠ جنيه وتختلف من حالة لأخرى (غير شاملة التركيبة)
`;

const SYSTEM_PROMPT = `أنت مساعدة ذكية تمثلين المركز الملكي للأسنان. اسمك "دكتور س" 🦷

معلومات المركز:
- الموقع: ${CLINIC.address}

- مواعيد العمل: ${CLINIC.hours}

الخدمات المتاحة:
${SERVICES_LIST}

الأسعار (لا تذكريها إلا إذا سأل المريض عن السعر تحديداً):
${PRICES_LIST}

تعليمات مهمة جداً:
- تكلمي المريض باللغة العربية الفصحى البسيطة بأسلوب ودي ومحترم
- لا تستخدمي عامية أو كلمات إنجليزية
- لو المريض سأل عن الخدمات، اذكري الخدمات فقط بدون أسعار
- لو المريض سأل عن السعر تحديداً، أخبريه بالسعر من القائمة
- لو المريض أراد حجز موعد، اطلبي منه: الاسم الكريم، رقم الهاتف، الخدمة المطلوبة، اليوم والوقت المناسب
- لو الخدمة المطلوبة هي زراعة سن، اطلبي منه إرسال صورة الأشعة أو صورة الفك (يمكن إرسالها كصورة أو PDF)
- لو اكتملت بيانات الحجز (الاسم، الهاتف، الخدمة، الموعد)، قولي له فقط: "تم استلام طلب حجزكم وسيتم التواصل معكم خلال ٣٠ دقيقة لتأكيد الموعد 😊" ثم في السطر الأخير من ردك فقط أضيفي:
[BOOKING_COMPLETE]الاسم: ... | الهاتف: ... | الخدمة: ... | الموعد: ...
مهم جداً: سطر [BOOKING_COMPLETE] لا يظهر للمريض أبداً، هو فقط للنظام الداخلي
- لو المريض يشكو من ألم، تعاطفي معه واقترحي له حجز موعد عاجل
- ردودك تكون مختصرة ومفيدة، لا تتجاوز ٣ أسطر
- استخدمي إيموجي بشكل لطيف 😊`;

// ═══════════════════════════════════════════
//  تاريخ المحادثات
// ═══════════════════════════════════════════
const conversations = {};

// ═══════════════════════════════════════════
//  إرسال رسالة نصية
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
//  إشعار العيادة عند اكتمال الحجز
// ═══════════════════════════════════════════
async function notifyClinic(bookingInfo) {
  const msg = `🔔 *حجز موعد جديد!*\n\n${bookingInfo}\n\n_يرجى التواصل مع المريض لتأكيد الموعد_`;
  await sendMessage(CLINIC_PHONE, msg);
  console.log('✅ تم إرسال إشعار للعيادة');
}

// ═══════════════════════════════════════════
//  Claude AI
// ═══════════════════════════════════════════
async function askClaude(chatId, userMessage) {
  if (!conversations[chatId]) conversations[chatId] = [];

  conversations[chatId].push({ role: 'user', content: userMessage });

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

    const fullReply = response.data.content[0].text;
    conversations[chatId].push({ role: 'assistant', content: fullReply });

    // لو في حجز مكتمل
    if (fullReply.includes('[BOOKING_COMPLETE]')) {
      const parts = fullReply.split('[BOOKING_COMPLETE]');
      const replyToUser = parts[0].trim();
      const bookingInfo = parts[1].trim();
      await notifyClinic(bookingInfo);
      return replyToUser;
    }

    return fullReply;

  } catch (err) {
    console.error('خطأ في Claude:', err.message);
    return 'معلش في مشكلة مؤقتة، حاول تاني بعد شوية 😅';
  }
}

// ═══════════════════════════════════════════
//  Webhook - استقبال الرسائل والملفات
// ═══════════════════════════════════════════
app.post('/webhook', async (req, res) => {
  res.sendStatus(200);
  const body = req.body;
  if (body.typeWebhook !== 'incomingMessageReceived') return;

  const chatId = body.senderData?.chatId;

  // تجاهل رسائل رقم العيادة نفسه
  if (chatId === CLINIC_PHONE) return;

  // رسالة نصية
  const text = body.messageData?.textMessageData?.textMessage;

  // صورة أو PDF
  const fileMsg = body.messageData?.fileMessageData;
  const imgMsg  = body.messageData?.imageMessageData;

  if (!chatId) return;

  // لو ملف أو صورة
  if (fileMsg || imgMsg) {
    const caption = fileMsg?.caption || imgMsg?.caption || '';
    const fileType = fileMsg ? 'مستند/PDF' : 'صورة';
    console.log(`📎 ملف من ${chatId}: ${fileType}`);
    const reply = await askClaude(chatId, `[أرسل المريض ${fileType}] ${caption}`);
    await sendMessage(chatId, reply);
    return;
  }

  if (!text) return;

  console.log(`📩 رسالة من ${chatId}: ${text}`);
  const reply = await askClaude(chatId, text);
  console.log(`🤖 رد البوت: ${reply}`);
  await sendMessage(chatId, reply);
});

app.get('/', (req, res) => res.send('🦷 المركز الملكي للأسنان - البوت شغال!'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ البوت شغال على بورت ${PORT}`));
