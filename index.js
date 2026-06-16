const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

const ID_INSTANCE   = process.env.ID_INSTANCE;
const API_TOKEN     = process.env.API_TOKEN;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

const CLINIC_BOOKING_PHONE = '201552762769@c.us'; // تأكيد المواعيد
const CLINIC_DOCTOR_PHONE  = '201552762764@c.us'; // التواصل مع الدكتور

// ── المواعيد المتاحة (كل نص ساعة من 1ظ لـ 11م) ──
function generateSlots() {
  const slots = [];
  for (let h = 13; h <= 22; h++) {
    slots.push(`${h}:00`);
    slots.push(`${h}:30`);
  }
  slots.push('23:00');
  return slots;
}

// تحويل الوقت لعرض عربي
function formatSlot(slot) {
  const [h, m] = slot.split(':').map(Number);
  const period = h < 12 ? 'ص' : 'م';
  const hour12 = h > 12 ? h - 12 : h;
  return `${hour12}:${m === 0 ? '٠٠' : '٣٠'} ${period}`;
}

const ALL_SLOTS = generateSlots();
const bookedSlots = new Set(); // المواعيد المحجوزة

function getAvailableSlots() {
  return ALL_SLOTS.filter(s => !bookedSlots.has(s));
}

// ── بيانات العيادة ──
const CLINIC = {
  name:    'المركز الملكي للأسنان - دكتور محمد حسن رشاد',
  address: 'https://maps.app.goo.gl/8J9ttWcARmAWw4r78',
  hours:   'كل الأيام من ١ ظهراً لـ ١١ مساءً',
};

const SERVICES_LIST = [
  'كشف وفحص',
  'تنظيف الجير مع التلميع',
  'حشو عادي',
  'حشو تجميلي',
  'حشو عصب مع طربوش',
  'خلع سن عادي',
  'خلع جراحي',
  'طربوش',
  'قشرة تجميلية',
  'تبييض الأسنان',
  'كوبري',
  'زراعة سن',
  'تقويم أسنان',
  'قص وتجميل اللثة',
  'زراعة الفك الكامل',
  'التواصل مع المركز',
];

const PRICES_LIST = `
- كشف وفحص: ٥٠٠ جنيه
- تنظيف الجير مع التلميع: ١٣٥٠ جنيه
- حشو عادي: ١٣٥٠ جنيه
- حشو تجميلي: ١٧٥٠ جنيه
- حشو عصب: ٤٨٥٠ جنيه
- خلع سن عادي: ٥٠٠ جنيه
- خلع جراحي: ٣٠٠٠ جنيه
- طربوش: من ٣٧٥٠ إلى ٧٥٠٠ جنيه حسب النوع
- قشرة تجميلية: من ٦٥٠٠ إلى ٨٥٠٠ جنيه حسب النوع
- تبييض الأسنان: ٢٥٠٠ جنيه
- قص وتجميل اللثة مع العظم للسن الواحد: ٦٥٠ جنيه
- زراعة سن: من ١٥٠٠٠ إلى ٢٥٠٠٠ جنيه
- تقويم أسنان: حسب خطة العلاج
- زراعة الفك الكامل: تصل لـ ١٣٠٠٠٠ جنيه (غير شاملة التركيبة)
`;

// ── حالة كل مستخدم ──
const userState = {}; // { step, name, phone, service, date, menuShown }
const conversations = {}; // تاريخ المحادثة مع Claude

// ── إرسال رسالة ──
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

// ── Claude للردود الحرة ──
async function askClaude(chatId, userMessage) {
  if (!conversations[chatId]) conversations[chatId] = [];
  conversations[chatId].push({ role: 'user', content: userMessage });
  if (conversations[chatId].length > 20) conversations[chatId] = conversations[chatId].slice(-20);

  try {
    const response = await axios.post('https://api.anthropic.com/v1/messages', {
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: `أنت مساعد ودي ومحترم للمركز الملكي للأسنان. اسمك "دكتور ف".
تكلم المريض بالعربية الفصحى البسيطة. لا تذكر أسعاراً إلا إذا سأل تحديداً.
الأسعار: ${PRICES_LIST}
ردودك قصيرة (٢-٣ أسطر). استخدم إيموجي بشكل لطيف. 
إذا كان المريض غاضباً أو محتاراً، تعاطف معه وساعده بهدوء.`,
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

// ── القائمة الرئيسية ──
function buildMainMenu() {
  let menu = `أهلاً وسهلاً بكم في *${CLINIC.name}* 🦷\n\nكيف يمكنني مساعدتكم؟ اختر من القائمة:\n\n`;
  SERVICES_LIST.forEach((s, i) => {
    menu += `${i + 1}️⃣ ${s}\n`;
  });
  return menu;
}

// ── قائمة المواعيد ──
function buildSlotsMenu(date) {
  const available = getAvailableSlots();
  if (available.length === 0) return null;

  let msg = `📅 المواعيد المتاحة ليوم *${date}*:\n\n`;
  available.forEach((slot, i) => {
    msg += `${i + 1}. ${formatSlot(slot)}\n`;
  });
  msg += `\nاكتب رقم الموعد المناسب لك:`;
  return msg;
}

// ── إشعار تأكيد الحجز ──
async function notifyBooking(state) {
  const slot = state.slot;
  const msg =
    `🔔 *حجز موعد جديد!*\n\n` +
    `👤 الاسم: ${state.name}\n` +
    `📞 الهاتف: ${state.phone}\n` +
    `🦷 الخدمة: ${state.service}\n` +
    `📅 التاريخ: ${state.date}\n` +
    `🕐 الوقت: ${formatSlot(slot)}\n\n` +
    `_يرجى التواصل مع المريض لتأكيد الموعد_`;
  try {
    const url = `https://7107.api.greenapi.com/waInstance${ID_INSTANCE}/sendMessage/${API_TOKEN}`;
    await axios.post(url, { chatId: CLINIC_BOOKING_PHONE, message: msg }, {
      headers: { 'Content-Type': 'application/json' }
    });
    console.log('✅ تم إرسال إشعار الحجز');
  } catch (err) {
    console.log('⚠️ فشل إشعار الحجز:', err.message);
  }
}

// ── إشعار التواصل مع الدكتور ──
async function notifyDoctor(chatId, name, phone) {
  const msg =
    `📢 *طلب تواصل جديد!*\n\n` +
    `👤 الاسم: ${name}\n` +
    `📞 الهاتف: ${phone}\n` +
    `💬 واتس اب: wa.me/${chatId.replace('@c.us', '')}\n\n` +
    `_المريض يريد التواصل مع أحد من المركز_`;
  try {
    const url = `https://7107.api.greenapi.com/waInstance${ID_INSTANCE}/sendMessage/${API_TOKEN}`;
    await axios.post(url, { chatId: CLINIC_DOCTOR_PHONE, message: msg }, {
      headers: { 'Content-Type': 'application/json' }
    });
    console.log('✅ تم إشعار الدكتور');
  } catch (err) {
    console.log('⚠️ فشل إشعار الدكتور:', err.message);
  }
}

// ── معالجة الرسائل ──
async function handleMessage(chatId, text) {
  const msg = text.trim();
  const st  = userState[chatId] || { step: 'welcome' };

  // ── مرحبا / ابدأ ──
  const greetings = ['مرحبا','هلو','أهلا','اهلا','hi','hello','ابدأ','ابدا','السلام عليكم','صباح الخير','مساء الخير'];
  if (greetings.includes(msg.toLowerCase()) || st.step === 'welcome') {
    userState[chatId] = { step: 'menu', menuShown: 1 };
    await sendMessage(chatId, buildMainMenu());
    return;
  }

  // ── اختيار من القائمة الرئيسية ──
  if (st.step === 'menu') {
    const choice = parseInt(msg);
    if (choice >= 1 && choice <= SERVICES_LIST.length) {
      const service = SERVICES_LIST[choice - 1];

      // التواصل مع المركز
      if (service === 'التواصل مع المركز') {
        userState[chatId] = { step: 'contact_name' };
        await sendMessage(chatId, `بكل سرور! 😊\nمن فضلك أرسل اسمك الكريم:`);
        return;
      }

      // حجز موعد
      userState[chatId] = { step: 'book_name', service, menuShown: 0 };
      await sendMessage(chatId, `ممتاز! اخترت *${service}* 🦷\n\nمن فضلك أرسل اسمك الكريم:`);
      return;
    }

    // مش رقم — Claude يرد
    const reply = await askClaude(chatId, msg);
    await sendMessage(chatId, reply);

    // لو مش بيتعامل مع القائمة، عرضها تاني بس مرة واحدة بس
    if (!st.menuShown || st.menuShown < 2) {
      userState[chatId] = { step: 'menu', menuShown: (st.menuShown || 0) + 1 };
      await sendMessage(chatId, `للمتابعة، يمكنك اختيار رقم من القائمة 👆`);
    }
    return;
  }

  // ── تسلسل الحجز ──
  if (st.step === 'book_name') {
    userState[chatId] = { ...st, step: 'book_phone', name: msg };
    await sendMessage(chatId, `شكراً *${msg}* 😊\n\nمن فضلك أرسل رقم هاتفك:`);
    return;
  }

  if (st.step === 'book_phone') {
    userState[chatId] = { ...st, step: 'book_date', phone: msg };

    // لو زراعة، اطلب الأشعة
    if (st.service && st.service.includes('زراعة')) {
      await sendMessage(chatId,
        `📎 لخدمة الزراعة، نحتاج صورة الأشعة أو صورة الفك.\n` +
        `يمكنك إرسالها كصورة أو PDF الآن، أو تخطيها وإرسالها لاحقاً.\n\n` +
        `من فضلك أرسل التاريخ المناسب للموعد (مثال: 20 يونيو):`
      );
    } else {
      await sendMessage(chatId, `من فضلك أرسل التاريخ المناسب للموعد:\n_(مثال: 20 يونيو)_`);
    }
    return;
  }

  if (st.step === 'book_date') {
    const available = getAvailableSlots();
    if (available.length === 0) {
      await sendMessage(chatId, `عذراً، لا توجد مواعيد متاحة حالياً. تواصل معنا مباشرة على ${CLINIC.phone} 📞`);
      userState[chatId] = { step: 'menu', menuShown: 0 };
      return;
    }
    userState[chatId] = { ...st, step: 'book_slot', date: msg, availableSlots: available };
    await sendMessage(chatId, buildSlotsMenu(msg));
    return;
  }

  if (st.step === 'book_slot') {
    const choice = parseInt(msg) - 1;
    const available = st.availableSlots || getAvailableSlots();

    if (isNaN(choice) || choice < 0 || choice >= available.length) {
      await sendMessage(chatId, `من فضلك اكتب رقم الموعد من القائمة 👆`);
      return;
    }

    const slot = available[choice];
    bookedSlots.add(slot); // قفل الموعد

    userState[chatId] = { ...st, step: 'done', slot };

    await sendMessage(chatId,
      `✅ *تم استلام طلب حجزكم!*\n\n` +
      `👤 ${st.name}\n` +
      `🦷 ${st.service}\n` +
      `📅 ${st.date} - ${formatSlot(slot)}\n\n` +
      `سيتم التواصل معكم خلال ٣٠ دقيقة لتأكيد الموعد 😊`
    );

    await notifyBooking({ ...st, slot });

    // إعادة للقائمة
    setTimeout(async () => {
      userState[chatId] = { step: 'menu', menuShown: 0 };
      await sendMessage(chatId, `هل تحتاج شيئاً آخر؟ اكتب *مرحبا* للعودة للقائمة 😊`);
    }, 2000);
    return;
  }

  // ── تسلسل التواصل مع المركز ──
  if (st.step === 'contact_name') {
    userState[chatId] = { ...st, step: 'contact_phone', name: msg };
    await sendMessage(chatId, `شكراً *${msg}*! 😊\n\nمن فضلك أرسل رقم هاتفك:`);
    return;
  }

  if (st.step === 'contact_phone') {
    const name  = st.name;
    const phone = msg;
    userState[chatId] = { step: 'menu', menuShown: 0 };

    await sendMessage(chatId,
      `✅ تم إرسال طلبك!\n\nسيتواصل معك أحد فريق المركز في أقرب وقت ممكن 😊`
    );
    await notifyDoctor(chatId, name, phone);
    return;
  }

  // ── أي رسالة خارج السياق ──
  const reply = await askClaude(chatId, msg);
  await sendMessage(chatId, reply);
  userState[chatId] = { step: 'menu', menuShown: 0 };
  await sendMessage(chatId, `اكتب *مرحبا* للعودة للقائمة الرئيسية 😊`);
}

// ── Webhook ──
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
    console.log(`📎 ملف من ${chatId}: ${fileType}`);
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
