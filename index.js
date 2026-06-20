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
  name:  'المركز الملكي للأسنان - دكتور محمد حسن رشاد',
  address: 'https://maps.app.goo.gl/8J9ttWcARmAWw4r78',
  hours: 'كل الأيام من ١ ظهراً لـ ١١ مساءً (ماعدا الجمعة)',
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
- زراعة الفك الكامل: تبدأ من ١٥٠,٠٠٠ جنيه شامل التركيب المؤقت الثابت
`;

const FULL_JAW_MSG = `💎 *زراعة الفك الكامل*

السعر يبدأ من *١٥٠,٠٠٠ جنيه* للفك الواحد شامل التركيب المؤقت الثابت 🦷

*السعر يشمل الآتي:*

• خلع الأسنان أو بقايا الأسنان المتهالكة طبقاً للخطة العلاجية
• تركيب ١٤ سن مؤقت لكل فك عند اللزوم
• التطعيم العظمي لكل زرعة حسب الاحتياج
• تركيب شبكة أو غشاء للزرعات حسب الاحتياج
• زراعة فك كامل بعدد ٦-٨ زرعات أوروبية حسب الحاجة

_الخدمات دي كلها تفصيل للسعر اللي بيبدأ من ١٥٠ ألف جنيه_ 😊`;

// تحويل الأرقام العربية للإنجليزية
function toEnglishNum(str) {
  return str.replace(/[٠١٢٣٤٥٦٧٨٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString());
}

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
  return `${hour12}:${m === 0 ? '٠٠' : '٣٠'} م`;
}

function getAvailableSlots() {
  return ALL_SLOTS.filter(s => !bookedSlots.has(s));
}

// تحويل التاريخ لرقمي واضح
function parseDate(input) {
  const arabicMonths = {
    'يناير': 1, 'فبراير': 2, 'مارس': 3, 'أبريل': 4, 'ابريل': 4,
    'مايو': 5, 'يونيو': 6, 'يونيه': 6, 'يوليو': 7, 'يوليه': 7,
    'أغسطس': 8, 'اغسطس': 8, 'سبتمبر': 9, 'أكتوبر': 10, 'اكتوبر': 10,
    'نوفمبر': 11, 'ديسمبر': 12
  };

  let normalized = toEnglishNum(input.trim());
  const now = new Date();
  let day, month, year;

  // "هذا الشهر" أو "الشهر ده"
  if (normalized.includes('هذا الشهر') || normalized.includes('الشهر ده') || normalized.includes('الشهر الحالي')) {
    const dayMatch = normalized.match(/(\d+)/);
    if (dayMatch) {
      day = parseInt(dayMatch[1]);
      month = now.getMonth() + 1;
      year = now.getFullYear();
    }
  } else {
    // ابحث عن اسم الشهر
    for (const [name, num] of Object.entries(arabicMonths)) {
      if (normalized.includes(name)) {
        month = num;
        const dayMatch = normalized.match(/(\d+)/);
        if (dayMatch) day = parseInt(dayMatch[1]);
        year = now.getFullYear();
        if (month < now.getMonth() + 1) year++;
        break;
      }
    }
    // لو رقمين فقط (يوم/شهر)
    if (!day) {
      const parts = normalized.match(/\d+/g);
      if (parts && parts.length >= 2) {
        day = parseInt(parts[0]);
        month = parseInt(parts[1]);
        year = now.getFullYear();
      } else if (parts && parts.length === 1) {
        day = parseInt(parts[0]);
        month = now.getMonth() + 1;
        year = now.getFullYear();
      }
    }
  }

  if (!day || !month || !year) return null;

  const date = new Date(year, month - 1, day);
  // تحقق إنه مش جمعة (5)
  if (date.getDay() === 5) return { error: 'friday' };

  const months = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
  return { formatted: `${day} ${months[month-1]} ${year}`, date };
}

const MAIN_MENU = `أهلاً وسهلاً بيك في *${CLINIC.name}* 🦷\n\nازاي أقدر أساعدك؟\n\n1️⃣ حجز موعد\n2️⃣ عنوان المركز ومواعيد العمل\n3️⃣ الخدمات والأسعار`;

const userState = {};
const conversations = {};

async function sendMessage(chatId, message) {
  try {
    console.log('📤 محاولة إرسال رسالة لـ', chatId);
    const url = `https://7107.api.greenapi.com/waInstance${ID_INSTANCE}/sendMessage/${API_TOKEN}`;
    const res = await axios.post(url, { chatId, message }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000
    });
    console.log('✅ تم الإرسال، الاستجابة:', JSON.stringify(res.data));
  } catch (err) {
    console.error('❌ خطأ في الإرسال:', err.response?.status, err.response?.data || err.message);
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
      `_المريض عايز يتواصل مع حد من المركز_`;
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
      system: `أنت مساعد ودي للمركز الملكي للأسنان اسمك "دكتور س".
اتكلم مع المريض بالعامية المصرية بأسلوب ودي ومحترم.
الخدمات والأسعار: ${SERVICES_LIST}
لو سأل عن زراعة فك كامل قوله السعر بيبدأ من ١٥٠ ألف جنيه وإنه يختار ٣ من القائمة عشان يعرف التفاصيل.
ردودك قصيرة ٢-٣ أسطر بس. لو المريض زعلان تعاطف معاه.
لا تبعت القائمة الرئيسية أبداً في ردك.`,
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
  const raw = text.trim();
  const msg = toEnglishNum(raw);
  const st  = userState[chatId] || { step: 'welcome' };

  const greetings = ['مرحبا','هلو','أهلا','اهلا','hi','hello','ابدأ','ابدا','السلام عليكم','صباح الخير','مساء الخير','هاي','هلا'];
  if (greetings.includes(msg.toLowerCase()) || st.step === 'welcome') {
    userState[chatId] = { step: 'main_menu' };
    await sendMessage(chatId, MAIN_MENU);
    return;
  }

  // القائمة الرئيسية
  if (st.step === 'main_menu') {
    if (msg === '1' || raw.includes('حجز')) {
      userState[chatId] = { step: 'book_name' };
      await sendMessage(chatId, `📅 *حجز موعد جديد*\n\nاتفضل، ابعت اسمك الكريم:`);
      return;
    }
    if (msg === '2' || raw.includes('عنوان') || raw.includes('فين')) {
      await sendMessage(chatId,
        `📍 *عنوان المركز*\n${CLINIC.address}\n\n🕐 *مواعيد العمل*\n${CLINIC.hours}`
      );
      return;
    }
    if (msg === '3' || raw.includes('خدم') || raw.includes('سعر') || raw.includes('أسعار')) {
      // لو سأل عن زراعة فك كامل
      if (raw.includes('فك') || raw.includes('زراعة فك')) {
        await sendMessage(chatId, FULL_JAW_MSG);
        return;
      }
      await sendMessage(chatId, `🦷 *خدمات وأسعار المركز*\n${SERVICES_LIST}`);
      return;
    }

    // سؤال عن زراعة فك كامل في أي وقت
    if (raw.includes('فك كامل') || raw.includes('زراعة فك') || (raw.includes('زراع') && raw.includes('فك'))) {
      await sendMessage(chatId, FULL_JAW_MSG);
      return;
    }

    const reply = await askClaude(chatId, raw);
    await sendMessage(chatId, reply);
    return;
  }

  // حجز - الاسم
  if (st.step === 'book_name') {
    userState[chatId] = { ...st, step: 'book_phone', name: raw };
    await sendMessage(chatId, `تمام يا *${raw}* 😊\n\nابعت رقم موبايلك:`);
    return;
  }

  // حجز - الهاتف
  if (st.step === 'book_phone') {
    userState[chatId] = { ...st, step: 'book_service', phone: raw };
    await sendMessage(chatId, `إيه الخدمة اللي محتاجها؟\n_(مثال: كشف، حشو، زراعة، تنظيف...)_`);
    return;
  }

  // حجز - الخدمة
  if (st.step === 'book_service') {
    userState[chatId] = { ...st, step: 'book_date', service: raw };
    if (raw.includes('زراع')) {
      await sendMessage(chatId,
        `📎 للزراعة بيفضل تبعت صورة الأشعة أو صورة الفك (صورة أو PDF).\n` +
        `تقدر تبعتها دلوقتي أو بعدين.\n\n` +
        `ابعت التاريخ المناسب للموعد:\n_(مثال: ٢٠ يونيو)_`
      );
    } else {
      await sendMessage(chatId, `ابعت التاريخ المناسب للموعد:\n_(مثال: ٢٠ يونيو)_`);
    }
    return;
  }

  // حجز - التاريخ
  if (st.step === 'book_date') {
    const parsed = parseDate(raw);
    if (!parsed) {
      await sendMessage(chatId, `مش فاهم التاريخ ده 😅\nابعته بشكل تاني مثلاً: *٢٠ يونيو*`);
      return;
    }
    if (parsed.error === 'friday') {
      await sendMessage(chatId, `عذراً، يوم الجمعة إجازة في المركز 🙏\nاختار يوم تاني:`);
      return;
    }

    const available = getAvailableSlots();
    if (available.length === 0) {
      await sendMessage(chatId, `عذراً، مفيش مواعيد متاحة دلوقتي. تواصل معانا مباشرة 📞`);
      userState[chatId] = { step: 'main_menu' };
      return;
    }

    userState[chatId] = { ...st, step: 'book_slot', date: parsed.formatted, availableSlots: available };
    let slotsMsg = `📅 المواعيد المتاحة ليوم *${parsed.formatted}*:\n\n`;
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
      await sendMessage(chatId, `اكتب رقم الموعد من القائمة اللي فوق 👆`);
      return;
    }

    const slot = available[choice];
    bookedSlots.add(slot);

    userState[chatId] = { step: 'done' };

    await sendMessage(chatId,
      `✅ *تم استلام طلب حجزك!*\n\n` +
      `👤 ${st.name}\n` +
      `🦷 ${st.service}\n` +
      `📅 ${st.date} - ${formatSlot(slot)}\n\n` +
      `هيتم التواصل معاك في أقرب وقت ممكن 😊`
    );

    await notifyBooking({ ...st, slot });
    return;
  }

  // تواصل - الاسم
  if (st.step === 'contact_name') {
    userState[chatId] = { ...st, step: 'contact_phone', name: raw };
    await sendMessage(chatId, `تمام يا *${raw}* 😊\n\nابعت رقم موبايلك:`);
    return;
  }

  // تواصل - الهاتف
  if (st.step === 'contact_phone') {
    await sendMessage(chatId, `✅ تم! هيتواصل معاك حد من المركز في أقرب وقت 😊`);
    await notifyDoctor(chatId, st.name, raw);
    userState[chatId] = { step: 'done' };
    return;
  }

  // سؤال عن زراعة فك في أي وقت
  if (raw.includes('فك كامل') || raw.includes('زراعة فك') || (raw.includes('زراع') && raw.includes('فك'))) {
    await sendMessage(chatId, FULL_JAW_MSG);
    return;
  }

  // Claude للأسئلة الخارجة عن السياق
  const reply = await askClaude(chatId, raw);
  await sendMessage(chatId, reply);
}

// Webhook
app.post('/webhook', async (req, res) => {
  res.sendStatus(200);
  const body = req.body;
  console.log('🔍 نوع الويب هوك:', body.typeWebhook);
  if (body.typeWebhook !== 'incomingMessageReceived') return;

  const chatId = body.senderData?.chatId;
  if (!chatId) return;
  if (chatId === CLINIC_BOOKING_PHONE || chatId === CLINIC_DOCTOR_PHONE) return;

  const text    = body.messageData?.textMessageData?.textMessage;
  const fileMsg = body.messageData?.fileMessageData;
  const imgMsg  = body.messageData?.imageMessageData;

  if (fileMsg || imgMsg) {
    const fileType = fileMsg ? 'مستند/PDF' : 'صورة';
    await sendMessage(chatId, `✅ تم استلام ${fileType} بنجاح! الدكتور هيشوفه قبل موعدك 😊`);
    return;
  }

  if (!text) return;
  console.log(`📩 ${chatId}: ${text}`);
  try {
    await handleMessage(chatId, text);
  } catch (err) {
    console.error('❌ خطأ غير متوقع في handleMessage:', err);
    await sendMessage(chatId, 'معلش حصلت مشكلة، حاول تاني 😅');
  }
});

app.get('/', (req, res) => res.send('🦷 المركز الملكي للأسنان - البوت شغال!'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ البوت شغال على بورت ${PORT}`));
