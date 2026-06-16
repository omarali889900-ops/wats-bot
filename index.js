const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

const ID_INSTANCE   = process.env.ID_INSTANCE;
const API_TOKEN     = process.env.API_TOKEN;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

const CLINIC_BOOKING_PHONE = '201552762769@c.us';
const CLINIC_DOCTOR_PHONE  = '201552762764@c.us';

const CLINIC = {
  name:    'المركز الملكي للأسنان - دكتور محمد حسن رشاد',
  address: 'https://maps.app.goo.gl/8J9ttWcARmAWw4r78',
  hours:   'كل الأيام من ١ ظهراً لـ ١١ مساءً',
};

const SERVICES_LIST = `
- كشف وفحص: ٥٠٠ جنيه
- تنظيف الجير مع التلميع: ١٣٥٠ جنيه
- حشو عادي: ١٣٥٠ جنيه
- حشو تجميلي: ١٧٥٠ جنيه
- حشو عصب: ٤٨٥٠ جنيه
- خلع سن عادي: ٥٠٠ جنيه
- خلع جراحي: ٣٠٠٠ جنيه
- طربوش: من ٣٧٥٠ إلى ٧٥٠٠ جنيه
- قشرة تجميلية: من ٦٥٠٠ إلى ٨٥٠٠ جنيه
- تبييض الأسنان: ٢٥٠٠ جنيه
- قص وتجميل اللثة: ٦٥٠ جنيه للسن
- زراعة سن: من ١٥٠٠٠ إلى ٢٥٠٠٠ جنيه
- تقويم أسنان: حسب خطة العلاج
- زراعة الفك الكامل: تصل لـ ١٣٠٠٠٠ جنيه (غير شاملة التركيبة)
`;

// المواعيد كل نص ساعة من 1ظ لـ 11م
const ALL_SLOTS = [];
for (let h = 13; h <= 22; h++) {
  ALL_SLOTS.push(`${h}:00`);
  ALL_SLOTS.push(`${h}:30`);
}
ALL_SLOTS.push('23:00');

const bookedSlots = new Set();

function formatSlot(slot) {
  const [h, m] = slot.split(':').map(Number);
  const hour12 = h > 12 ? h - 12 : h;
  const period = h >= 12 ? 'م' : 'ص';
  return `${hour12}:${m === 0 ? '٠٠' : '٣٠'} ${period}`;
}

function getAvailableSlots() {
  return ALL_SLOTS.filter(s => !bookedSlots.has(s));
}

const MAIN_MENU = `أهلاً وسهلاً بكم في *${CLINIC.name}* 🦷\n\nكيف يمكنني مساعدتكم؟\n\n1️⃣ حجز موعد\n2️⃣ عنوان المركز ومواعيد العمل\n3️⃣ الخدمات والأسعار`;

// حالة المستخدمين
const userState = {};
const conversations = {};

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

async function notifyBooking(info) {
  try {
    const msg =
      `🔔 *حجز موعد جديد!*\n\n` +
      `👤 الاسم: ${info.name}\n` +
      `📞 الهاتف: ${info.phone}\n` +
      `🦷 الخدمة: ${info.service}\n` +
      `📅 التاريخ: ${info.date}\n` +
      `🕐 الوقت: ${formatSlot(info.slot)}\n\n` +
      `_يرجى التواصل مع المريض لتأكيد الموعد_`;
    const url = `https://7107.api.greenapi.com/waInstance${ID_INSTANCE}/sendMessage/${API_TOKEN}`;
    await axios.post(url, { chatId: CLINIC_BOOKING_PHONE, message: msg }, {
      headers: { 'Content-Type': 'application/json' }
    });
    console.log('✅ إشعار الحجز أُرسل');
  } catch (err) {
    console.log('⚠️ فشل إشعار الحجز:', err.message);
  }
}

async function notifyDoctor(chatId, name, phone) {
  try {
    const msg =
      `📢 *طلب تواصل جديد!*\n\n` +
      `👤 الاسم: ${name}\n` +
      `📞 الهاتف: ${phone}\n\n` +
      `_المريض يريد التواصل مع أحد من المركز_`;
    const url = `https://7107.api.greenapi.com/waInstance${ID_INSTANCE}/sendMessage/${API_TOKEN}`;
    await axios.post(url, { chatId: CLINIC_DOCTOR_PHONE, message: msg }, {
      headers: { 'Content-Type': 'application/json' }
    });
    console.log('✅ إشعار الدكتور أُرسل');
  } catch (err) {
    console.log('⚠️ فشل إشعار الدكتور:', err.message);
  }
}

async function askClaude(chatId, userMessage) {
  if (!conversations[chatId]) conversations[chatId] = [];
  conversations[chatId].push({ role: 'user', content: userMessage });
  if (conversations[chatId].length > 20) conversations[chatId] = conversations[chatId].slice(-20);

  try {
    const response = await axios.post('https://api.anthropic.com/v1/messages', {
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: `أنت مساعد ودي ومحترم للمركز الملكي للأسنان اسمك "دكتور ق".
تكلم المريض بالعربية الفصحى البسيطة بأسلوب ودي.
الخدمات والأسعار: ${SERVICES_LIST}
ردودك قصيرة (٢-٣ أسطر). إذا كان المريض غاضباً أو محتاراً تعاطف معه وساعده بهدوء.
لا تذكر أسعاراً إلا إذا سأل تحديداً.`,
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

async function handleMessage(chatId, text) {
  const msg = text.trim();
  const st  = userState[chatId] || { step: 'welcome' };

  // ترحيب
  const greetings = ['مرحبا','هلو','أهلا','اهلا','hi','hello','ابدأ','ابدا','السلام عليكم','صباح الخير','مساء الخير','هاي'];
  if (greetings.includes(msg.toLowerCase()) || st.step === 'welcome') {
    userState[chatId] = { step: 'main_menu' };
    await sendMessage(chatId, MAIN_MENU);
    return;
  }

  // القائمة الرئيسية
  if (st.step === 'main_menu') {
    if (msg === '1' || msg.includes('حجز')) {
      userState[chatId] = { step: 'book_name' };
      await sendMessage(chatId, `📅 *حجز موعد جديد*\n\nمن فضلك أرسل اسمك الكريم:`);
      return;
    }
    if (msg === '2' || msg.includes('عنوان') || msg.includes('موعد')) {
      await sendMessage(chatId,
        `📍 *عنوان المركز*\n${CLINIC.address}\n\n` +
        `🕐 *مواعيد العمل*\n${CLINIC.hours}`
      );
      await sendMessage(chatId, MAIN_MENU);
      return;
    }
    if (msg === '3' || msg.includes('خدم') || msg.includes('سعر')) {
      await sendMessage(chatId, `🦷 *خدمات وأسعار المركز*\n${SERVICES_LIST}`);
      await sendMessage(chatId, MAIN_MENU);
      return;
    }
    // رد Claude لو مش اختيار
    const reply = await askClaude(chatId, msg);
    await sendMessage(chatId, reply);
    await sendMessage(chatId, MAIN_MENU);
    return;
  }

  // حجز - الاسم
  if (st.step === 'book_name') {
    userState[chatId] = { ...st, step: 'book_phone', name: msg };
    await sendMessage(chatId, `شكراً *${msg}* 😊\n\nمن فضلك أرسل رقم هاتفك:`);
    return;
  }

  // حجز - الهاتف
  if (st.step === 'book_phone') {
    userState[chatId] = { ...st, step: 'book_service', phone: msg };
    await sendMessage(chatId,
      `ما هي الخدمة المطلوبة؟\n\n` +
      `_(مثال: كشف، حشو، زراعة، تنظيف...)_`
    );
    return;
  }

  // حجز - الخدمة
  if (st.step === 'book_service') {
    userState[chatId] = { ...st, step: 'book_date', service: msg };
    if (msg.includes('زراع')) {
      await sendMessage(chatId,
        `📎 لخدمة الزراعة يُفضل إرسال صورة الأشعة أو صورة الفك كصورة أو PDF.\n` +
        `يمكنك إرسالها الآن أو لاحقاً.\n\n` +
        `من فضلك أرسل التاريخ المناسب:\n_(مثال: ٢٠ يونيو)_`
      );
    } else {
      await sendMessage(chatId, `من فضلك أرسل التاريخ المناسب للموعد:\n_(مثال: ٢٠ يونيو)_`);
    }
    return;
  }

  // حجز - التاريخ
  if (st.step === 'book_date') {
    const available = getAvailableSlots();
    if (available.length === 0) {
      await sendMessage(chatId, `عذراً، لا توجد مواعيد متاحة حالياً. تواصل معنا مباشرة 📞`);
      userState[chatId] = { step: 'main_menu' };
      await sendMessage(chatId, MAIN_MENU);
      return;
    }
    userState[chatId] = { ...st, step: 'book_slot', date: msg, availableSlots: available };

    let slotsMsg = `📅 المواعيد المتاحة ليوم *${msg}*:\n\n`;
    available.forEach((slot, i) => {
      slotsMsg += `${i + 1}. ${formatSlot(slot)}\n`;
    });
    slotsMsg += `\nاكتب رقم الموعد المناسب:`;
    await sendMessage(chatId, slotsMsg);
    return;
  }

  // حجز - اختيار الموعد
  if (st.step === 'book_slot') {
    const available = st.availableSlots || getAvailableSlots();
    const choice = parseInt(msg) - 1;

    if (isNaN(choice) || choice < 0 || choice >= available.length) {
      await sendMessage(chatId, `من فضلك اكتب رقم الموعد من القائمة 👆`);
      return;
    }

    const slot = available[choice];
    bookedSlots.add(slot);

    await sendMessage(chatId,
      `✅ *تم استلام طلب حجزكم!*\n\n` +
      `👤 ${st.name}\n` +
      `🦷 ${st.service}\n` +
      `📅 ${st.date} - ${formatSlot(slot)}\n\n` +
      `سيتم التواصل معكم خلال ٣٠ دقيقة لتأكيد الموعد 😊`
    );

    await notifyBooking({ ...st, slot });

    userState[chatId] = { step: 'main_menu' };
    setTimeout(async () => {
      await sendMessage(chatId, MAIN_MENU);
    }, 2000);
    return;
  }

  // تواصل مع الدكتور - الاسم
  if (st.step === 'contact_name') {
    userState[chatId] = { ...st, step: 'contact_phone', name: msg };
    await sendMessage(chatId, `شكراً *${msg}*! 😊\n\nمن فضلك أرسل رقم هاتفك:`);
    return;
  }

  // تواصل مع الدكتور - الهاتف
  if (st.step === 'contact_phone') {
    await sendMessage(chatId, `✅ تم إرسال طلبك!\nسيتواصل معك أحد فريق المركز قريباً 😊`);
    await notifyDoctor(chatId, st.name, msg);
    userState[chatId] = { step: 'main_menu' };
    setTimeout(async () => {
      await sendMessage(chatId, MAIN_MENU);
    }, 2000);
    return;
  }

  // أي رسالة خارج السياق - Claude يرد
  const reply = await askClaude(chatId, msg);
  await sendMessage(chatId, reply);

  // لو ذكر التواصل
  if (msg.includes('تواصل') || msg.includes('دكتور') || msg.includes('اتكلم')) {
    userState[chatId] = { step: 'contact_name' };
    await sendMessage(chatId, `بكل سرور! 😊\nمن فضلك أرسل اسمك الكريم:`);
    return;
  }

  userState[chatId] = { step: 'main_menu' };
  await sendMessage(chatId, MAIN_MENU);
}

// Webhook
app.post('/webhook', async (req, res) => {
  res.sendStatus(200);
  const body = req.body;
  if (body.typeWebhook !== 'incomingMessageReceived') return;

  const chatId = body.senderData?.chatId;
  if (!chatId) return;
  if (chatId === CLINIC_BOOKING_PHONE || chatId === CLINIC_DOCTOR_PHONE) return;

  const text    = body.messageData?.textMessageData?.textMessage;
  const fileMsg = body.messageData?.fileMessageData;
  const imgMsg  = body.messageData?.imageMessageData;

  if (fileMsg || imgMsg) {
    const fileType = fileMsg ? 'مستند/PDF' : 'صورة';
    console.log(`📎 ملف من ${chatId}`);
    await sendMessage(chatId, `✅ تم استلام ${fileType} بنجاح! سيراجعه الدكتور قبل موعدك 😊`);
    return;
  }

  if (!text) return;
  console.log(`📩 ${chatId}: ${text}`);
  await handleMessage(chatId, text);
});

app.get('/', (req, res) => res.send('🦷 المركز الملكي للأسنان - البوت شغال!'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ البوت شغال على بورت ${PORT}`));
