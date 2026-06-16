const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

const ID_INSTANCE        = process.env.ID_INSTANCE;
const API_TOKEN          = process.env.API_TOKEN;
const ANTHROPIC_KEY      = process.env.ANTHROPIC_API_KEY;

// أرقام العيادة
const CLINIC_CONFIRM_PHONE = '201552762769@c.us'; // تأكيد المواعيد
const CLINIC_CONTACT_PHONE = '201552762764@c.us'; // طلبات التواصل مع الدكتور

const CLINIC = {
  name:    'المركز الملكي للأسنان دكتور محمد حسن رشاد',
  address: 'https://maps.app.goo.gl/8J9ttWcARmAWw4r78',
  phone:   '+20 10 99595956',
  hours:   'كل الأيام من ١ ظهراً لـ ١١ مساءً',
};

const SERVICES_LIST = `
- كشف وفحص
- تنظيف الجير مع التلميع
- حشو عادي
- حشو تجميلي
- حشو عصب مع طربوش
- خلع سن عادي
- خلع جراحي
- طربوش
- قشرة تجميلية
- تبييض الأسنان
- كوبري
- زراعة سن
- تقويم أسنان
- قص وتجميل اللثة مع العظم للسن الواحد
- زراعة الفك الكامل
`;

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
- زراعة الفك الكامل: تكلفة تصل لـ ١٣٠٠٠٠ جنيه وتختلف من حالة لأخرى (غير شاملة التركيبة)
`;

// ===== إدارة المواعيد المتاحة =====
// المواعيد من 1 ظهراً إلى 11 مساءً كل نص ساعة
function generateTimeSlots() {
  const slots = [];
  // من 13:00 إلى 22:30 (آخر موعد 10:30 مساءً حتى ينتهي 11)
  for (let hour = 13; hour <= 22; hour++) {
    for (let min of [0, 30]) {
      if (hour === 22 && min === 30) continue; // لا نريد 10:30 مساءً كبداية
      const displayHour = hour > 12 ? hour - 12 : hour;
      const period = hour >= 12 ? 'مساءً' : 'ظهراً';
      const minuteStr = min === 0 ? ':00' : ':30';
      const label = `${displayHour}${minuteStr} ${period}`;
      const key = `${hour}:${min === 0 ? '00' : '30'}`;
      slots.push({ key, label, booked: false });
    }
  }
  return slots;
}

// تخزين المواعيد في الذاكرة (تتصفر كل ما البوت بيعيد تشغيل)
const timeSlots = generateTimeSlots();

function getAvailableSlots() {
  return timeSlots.filter(s => !s.booked);
}

function bookSlot(key) {
  const slot = timeSlots.find(s => s.key === key);
  if (slot) slot.booked = true;
}

function formatAvailableSlots() {
  const available = getAvailableSlots();
  if (available.length === 0) return 'عذراً، لا تتوفر مواعيد متاحة حالياً.';
  
  let msg = '🕐 *المواعيد المتاحة:*\n';
  available.forEach((slot, index) => {
    msg += `${index + 1}. ${slot.label}\n`;
  });
  msg += '\nاختر رقم الموعد المناسب لك 😊';
  return msg;
}

// ===== القوائم الرئيسية =====
const MAIN_MENU = `مرحباً بك في *المركز الملكي للأسنان* 🦷

اختر من القائمة التالية:

1️⃣ حجز موعد
2️⃣ الخدمات المتاحة
3️⃣ الأسعار
4️⃣ موقع العيادة ومواعيد العمل
5️⃣ التواصل مع الدكتور مباشرة

اكتب رقم اختيارك 😊`;

const SERVICES_MENU = `🦷 *خدماتنا المتاحة:*

1. كشف وفحص
2. تنظيف الجير مع التلميع
3. حشو عادي
4. حشو تجميلي
5. حشو عصب مع طربوش
6. خلع سن عادي
7. خلع جراحي
8. طربوش
9. قشرة تجميلية
10. تبييض الأسنان
11. كوبري
12. زراعة سن
13. تقويم أسنان
14. قص وتجميل اللثة
15. زراعة الفك الكامل

للاستفسار عن أي خدمة أو حجز موعد، اكتب *1* للعودة للقائمة الرئيسية 😊`;

// حالات المحادثة
const STATE = {
  IDLE: 'idle',
  AWAITING_NAME: 'awaiting_name',
  AWAITING_PHONE: 'awaiting_phone',
  AWAITING_SERVICE: 'awaiting_service',
  AWAITING_DATE: 'awaiting_date',
  AWAITING_TIME: 'awaiting_time',
  AWAITING_XRAY: 'awaiting_xray',
  COMPLETE: 'complete',
  FREE_CHAT: 'free_chat',
};

const conversations = {}; // تاريخ المحادثة لـ Claude
const userStates   = {};  // حالة المحادثة الهيكلية
const bookingData  = {};  // بيانات الحجز الجارية

function getState(chatId) {
  return userStates[chatId] || { state: STATE.IDLE, menuShownCount: 0, lastMenuTime: 0 };
}

function setState(chatId, state, extra = {}) {
  userStates[chatId] = { ...getState(chatId), state, ...extra };
}

// ===== إرسال الرسائل =====
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

// إشعار تأكيد الموعد → 01552762769
async function notifyBookingConfirm(bookingInfo) {
  try {
    const msg = `🔔 *حجز موعد جديد!*\n\n${bookingInfo}\n\n_يرجى التواصل مع المريض لتأكيد الموعد_`;
    const url = `https://7107.api.greenapi.com/waInstance${ID_INSTANCE}/sendMessage/${API_TOKEN}`;
    await axios.post(url, { chatId: CLINIC_CONFIRM_PHONE, message: msg }, {
      headers: { 'Content-Type': 'application/json' }
    });
    console.log('✅ تم إرسال تأكيد الحجز للعيادة');
  } catch (err) {
    console.log('⚠️ تعذر إرسال تأكيد الحجز:', err.message);
  }
}

// إشعار طلب التواصل مع الدكتور → 01552762764
async function notifyContactRequest(chatId, patientInfo) {
  try {
    const msg = `📞 *طلب تواصل مع الدكتور*\n\nرقم المريض: ${chatId.replace('@c.us', '')}\n${patientInfo ? `معلومات إضافية: ${patientInfo}` : ''}\n\n_المريض يريد التحدث مع الدكتور مباشرة_`;
    const url = `https://7107.api.greenapi.com/waInstance${ID_INSTANCE}/sendMessage/${API_TOKEN}`;
    await axios.post(url, { chatId: CLINIC_CONTACT_PHONE, message: msg }, {
      headers: { 'Content-Type': 'application/json' }
    });
    console.log('✅ تم إرسال طلب التواصل');
  } catch (err) {
    console.log('⚠️ تعذر إرسال طلب التواصل:', err.message);
  }
}

// ===== Claude للمحادثة الحرة =====
const FREE_CHAT_SYSTEM = `أنت مساعدة ذكية تمثلين المركز الملكي للأسنان دكتور محمد حسن رشاد. اسمك "دكتور س" 🦷

معلومات المركز:
- الموقع: ${CLINIC.address}
- مواعيد العمل: ${CLINIC.hours}
- هاتف: ${CLINIC.phone}

الخدمات المتاحة:
${SERVICES_LIST}

الأسعار (لا تذكريها إلا إذا سأل المريض عن السعر تحديداً):
${PRICES_LIST}

تعليمات:
- تكلمي المريض باللغة العربية الفصحى البسيطة بأسلوب ودي ومحترم
- ردودك مختصرة ومفيدة (٢-٣ أسطر بحد أقصى)
- لو المريض يريد حجز موعد أو يسأل عن الخدمات بشكل رسمي، قولي له اكتب "قائمة" للعودة للقائمة الرئيسية
- لو المريض يشكو من ألم، تعاطفي معه واقترحي له حجز موعد عاجل
- استخدمي إيموجي بشكل لطيف 😊
- لا تعيدي إرسال القائمة الرئيسية من تلقاء نفسك، فقط أجيبي على سؤاله`;

async function askClaude(chatId, userMessage) {
  if (!conversations[chatId]) conversations[chatId] = [];
  conversations[chatId].push({ role: 'user', content: userMessage });
  if (conversations[chatId].length > 20) {
    conversations[chatId] = conversations[chatId].slice(-20);
  }
  try {
    const response = await axios.post('https://api.anthropic.com/v1/messages', {
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system: FREE_CHAT_SYSTEM,
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

// ===== منطق المحادثة الهيكلية =====
async function handleStructuredFlow(chatId, text) {
  const stateObj = getState(chatId);
  const state    = stateObj.state;
  const booking  = bookingData[chatId] || {};

  // كلمة "قائمة" ترجع للقائمة الرئيسية في أي وقت
  if (text.trim() === 'قائمة' || text.trim() === '0') {
    setState(chatId, STATE.IDLE);
    bookingData[chatId] = {};
    await sendMessage(chatId, MAIN_MENU);
    return true;
  }

  // ===== القائمة الرئيسية =====
  if (state === STATE.IDLE) {
    if (text === '1') {
      setState(chatId, STATE.AWAITING_NAME);
      bookingData[chatId] = {};
      await sendMessage(chatId, '📝 لحجز موعد، نحتاج بعض المعلومات.\n\nما اسمك الكريم؟');
      return true;
    }
    if (text === '2') {
      await sendMessage(chatId, SERVICES_MENU);
      return true;
    }
    if (text === '3') {
      const pricesMsg = `💰 *أسعار خدماتنا:*\n${PRICES_LIST}\n\nللاستفسار أو الحجز اكتب *1* 😊`;
      await sendMessage(chatId, pricesMsg);
      return true;
    }
    if (text === '4') {
      const locationMsg = `📍 *المركز الملكي للأسنان*\n\n🗺️ الموقع: ${CLINIC.address}\n⏰ مواعيد العمل: ${CLINIC.hours}\n📞 هاتف: ${CLINIC.phone}\n\nنسعد بخدمتك 😊`;
      await sendMessage(chatId, locationMsg);
      return true;
    }
    if (text === '5') {
      await notifyContactRequest(chatId, '');
      await sendMessage(chatId, '✅ تم إرسال طلبك!\n\nسيتواصل معك أحد أعضاء فريق العيادة في أقرب وقت ممكن 😊\n\nللعودة للقائمة الرئيسية اكتب *قائمة*');
      return true;
    }
    // رقم غير معروف في القائمة → دع Claude يتعامل
    return false;
  }

  // ===== خطوات الحجز =====
  if (state === STATE.AWAITING_NAME) {
    if (text.length < 2) {
      await sendMessage(chatId, 'من فضلك أدخل اسمك الكريم 😊');
      return true;
    }
    bookingData[chatId] = { ...booking, name: text };
    setState(chatId, STATE.AWAITING_PHONE);
    await sendMessage(chatId, `شكراً ${text} 😊\n\nما رقم هاتفك؟`);
    return true;
  }

  if (state === STATE.AWAITING_PHONE) {
    const phone = text.replace(/\s/g, '');
    if (phone.length < 10) {
      await sendMessage(chatId, 'من فضلك أدخل رقم هاتف صحيح 📱');
      return true;
    }
    bookingData[chatId] = { ...booking, phone };
    setState(chatId, STATE.AWAITING_SERVICE);
    await sendMessage(chatId, `ممتاز! 👍\n\nما الخدمة التي تحتاجها؟\n${SERVICES_LIST}\n\nاكتب اسم الخدمة 😊`);
    return true;
  }

  if (state === STATE.AWAITING_SERVICE) {
    bookingData[chatId] = { ...booking, service: text };
    // لو زراعة سن → اطلب أشعة
    const needsXray = text.includes('زراع') || text.includes('زرع');
    if (needsXray) {
      setState(chatId, STATE.AWAITING_XRAY);
      await sendMessage(chatId, '🦴 لخدمة الزراعة، نحتاج صورة الأشعة أو صورة الفك.\n\nمن فضلك أرسل الصورة أو PDF الأشعة، أو اكتب *تخطى* إذا لم تكن متاحة الآن.');
      return true;
    }
    setState(chatId, STATE.AWAITING_DATE);
    await sendMessage(chatId, '📅 ما اليوم المناسب لك؟ (مثال: الأحد، الاثنين... أو أكتب التاريخ)');
    return true;
  }

  if (state === STATE.AWAITING_XRAY) {
    // قبل الأشعة أو تخطي
    bookingData[chatId] = { ...booking, xray: text === 'تخطى' ? 'لم يُرسل' : 'تم الإرسال' };
    setState(chatId, STATE.AWAITING_DATE);
    await sendMessage(chatId, '📅 ما اليوم المناسب لك؟ (مثال: الأحد، الاثنين... أو أكتب التاريخ)');
    return true;
  }

  if (state === STATE.AWAITING_DATE) {
    bookingData[chatId] = { ...booking, date: text };
    setState(chatId, STATE.AWAITING_TIME);
    const slotsMsg = formatAvailableSlots();
    await sendMessage(chatId, slotsMsg);
    return true;
  }

  if (state === STATE.AWAITING_TIME) {
    const available = getAvailableSlots();
    const choice    = parseInt(text.trim());

    if (!isNaN(choice) && choice >= 1 && choice <= available.length) {
      const selectedSlot = available[choice - 1];
      bookSlot(selectedSlot.key);

      const finalBooking = { ...booking, time: selectedSlot.label };
      bookingData[chatId] = finalBooking;

      const bookingInfo = `الاسم: ${finalBooking.name} | الهاتف: ${finalBooking.phone} | الخدمة: ${finalBooking.service} | اليوم: ${finalBooking.date} | الوقت: ${finalBooking.time}`;

      // إرسال تأكيد الحجز للعيادة على 01552762769
      await notifyBookingConfirm(bookingInfo);

      setState(chatId, STATE.IDLE);
      bookingData[chatId] = {};

      await sendMessage(chatId,
        `✅ *تم استلام طلب حجزكم بنجاح!*\n\n` +
        `👤 الاسم: ${finalBooking.name}\n` +
        `📱 الهاتف: ${finalBooking.phone}\n` +
        `🦷 الخدمة: ${finalBooking.service}\n` +
        `📅 اليوم: ${finalBooking.date}\n` +
        `🕐 الوقت: ${finalBooking.time}\n\n` +
        `سيتم التواصل معكم خلال ٣٠ دقيقة لتأكيد الموعد 😊\n\nللعودة للقائمة الرئيسية اكتب *قائمة*`
      );
      return true;
    } else {
      // اختيار غير صحيح
      const slotsMsg = formatAvailableSlots();
      await sendMessage(chatId, `من فضلك اختر رقم صحيح من المواعيد المتاحة:\n\n${slotsMsg}`);
      return true;
    }
  }

  return false;
}

// ===== Webhook الرئيسي =====
app.post('/webhook', async (req, res) => {
  res.sendStatus(200);
  const body = req.body;
  if (body.typeWebhook !== 'incomingMessageReceived') return;

  const chatId = body.senderData?.chatId;
  if (!chatId) return;

  // تجاهل رسائل العيادة
  if (chatId === CLINIC_CONFIRM_PHONE || chatId === CLINIC_CONTACT_PHONE) return;

  const text    = body.messageData?.textMessageData?.textMessage?.trim();
  const fileMsg = body.messageData?.fileMessageData;
  const imgMsg  = body.messageData?.imageMessageData;

  // معالجة الصور والملفات
  if (fileMsg || imgMsg) {
    const caption  = fileMsg?.caption || imgMsg?.caption || '';
    const fileType = fileMsg ? 'مستند/PDF' : 'صورة';
    console.log(`📎 ملف من ${chatId}: ${fileType}`);

    const stateObj = getState(chatId);
    if (stateObj.state === STATE.AWAITING_XRAY) {
      bookingData[chatId] = { ...(bookingData[chatId] || {}), xray: 'تم إرسال الصورة' };
      setState(chatId, STATE.AWAITING_DATE);
      await sendMessage(chatId, '✅ شكراً، تم استلام الصورة!\n\n📅 ما اليوم المناسب لك؟');
      return;
    }

    const reply = await askClaude(chatId, `[أرسل المريض ${fileType}] ${caption}`);
    await sendMessage(chatId, reply);
    return;
  }

  if (!text) return;

  console.log(`📩 من ${chatId}: ${text}`);

  const stateObj = getState(chatId);

  // ===== رسالة الترحيب للمستخدم الجديد =====
  if (stateObj.state === STATE.IDLE && conversations[chatId] === undefined) {
    conversations[chatId] = [];
    await sendMessage(chatId, `أهلاً وسهلاً بك في *المركز الملكي للأسنان* 🦷\n\nنسعد بخدمتك دائماً 😊\n\n${MAIN_MENU}`);
    return;
  }

  // ===== محاولة التدفق الهيكلي أولاً =====
  const handled = await handleStructuredFlow(chatId, text);

  if (!handled) {
    // المستخدم خارج السيناريو → Claude يتكلم معه بشكل طبيعي
    // لو المستخدم في IDLE وكتب أي كلام حر
    const lowerText = text.toLowerCase();
    const wantsMenu = ['قائمة', 'مساعدة', 'help', 'ابدأ', 'هلو', 'مرحبا', 'مرحباً', 'السلام', 'اهلا', 'أهلاً', 'هاي'].some(w => text.includes(w));

    if (wantsMenu && stateObj.state === STATE.IDLE) {
      setState(chatId, STATE.IDLE);
      await sendMessage(chatId, MAIN_MENU);
      return;
    }

    // Claude يرد بشكل طبيعي بدون إرسال القائمة
    const reply = await askClaude(chatId, text);
    await sendMessage(chatId, reply);

    // بعد رد Claude، لو في IDLE نضيف تلميح خفيف للقائمة (مرة واحدة فقط)
    if (stateObj.state === STATE.IDLE) {
      const now = Date.now();
      const lastHint = stateObj.lastMenuHint || 0;
      // فقط لو مضى ١٠ دقايق من آخر تلميح
      if (now - lastHint > 10 * 60 * 1000) {
        setState(chatId, STATE.IDLE, { lastMenuHint: now });
        await sendMessage(chatId, '💡 للعودة للقائمة الرئيسية اكتب *قائمة* في أي وقت 😊');
      }
    }
  }
});

app.get('/', (req, res) => res.send('🦷 المركز الملكي للأسنان - البوت شغال!'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ البوت شغال على بورت ${PORT}`));
