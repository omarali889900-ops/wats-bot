const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

// ═══════════════════════════════════════════
//  ضع بياناتك هنا (لا تشاركها مع أي حد)
// ═══════════════════════════════════════════
const ID_INSTANCE    = 'ضع idInstance هنا';
const API_TOKEN      = 'ضع apiTokenInstance هنا';
const BASE_URL       = `https://api.green-api.com/waInstance${ID_INSTANCE}`;

// ═══════════════════════════════════════════
//  بيانات العيادة (عدّل عليها براحتك)
// ═══════════════════════════════════════════
const CLINIC = {
  name:    'عيادة الابتسامة للأسنان',
  address: '٢٣ شارع التحرير، الدور الثالث، المهندسين، الجيزة',
  phone:   '٠١٢٣-٤٥٦-٧٨٩',
  hours:   'السبت – الخميس: ١٠ص – ٩م | الجمعة: ٤ع – ٩م',
};

const SERVICES = `
🦷 حشو الأسنان        → من ٢٠٠ إلى ٤٠٠ جنيه
🌟 تبييض الأسنان      → من ٨٠٠ إلى ١٢٠٠ جنيه
👑 تركيب كراون        → من ١٥٠٠ إلى ٣٠٠٠ جنيه
🦴 زراعة أسنان        → من ٥٠٠٠ إلى ٨٠٠٠ جنيه
📐 تقويم أسنان        → من ٤٠٠٠ إلى ٧٠٠٠ جنيه
🩺 كشف وتنظيف         → ١٥٠ جنيه
😬 قلع أسنان          → من ٢٠٠ إلى ٥٠٠ جنيه
`;

// ═══════════════════════════════════════════
//  إرسال رسالة
// ═══════════════════════════════════════════
async function sendMessage(chatId, message) {
  try {
    await axios.post(`${BASE_URL}/sendMessage/${API_TOKEN}`, {
      chatId,
      message,
    });
  } catch (err) {
    console.error('خطأ في الإرسال:', err.message);
  }
}

// ═══════════════════════════════════════════
//  حالة المستخدمين (مؤقت في الذاكرة)
// ═══════════════════════════════════════════
const userState = {};

// ═══════════════════════════════════════════
//  منطق البوت
// ═══════════════════════════════════════════
async function handleMessage(chatId, text) {
  const msg = text.trim();
  const state = userState[chatId] || 'welcome';

  // ── القائمة الرئيسية ──
  if (['مرحبا','هلو','أهلا','اهلا','hi','hello','ابدأ','ابدا','1'].includes(msg.toLowerCase()) || state === 'welcome') {
    userState[chatId] = 'menu';
    await sendMessage(chatId,
      `أهلًا وسهلًا بك في *${CLINIC.name}* 😊\n\nاختار من القائمة:\n\n` +
      `1️⃣ حجز موعد\n` +
      `2️⃣ الأسعار والخدمات\n` +
      `3️⃣ الموقع ومواعيد العمل\n` +
      `4️⃣ أسئلة شائعة\n\n` +
      `_اكتب رقم الاختيار_`
    );
    return;
  }

  // ── المنيو ──
  if (state === 'menu') {
    if (msg === '1' || msg.includes('حجز') || msg.includes('موعد')) {
      userState[chatId] = 'book_name';
      await sendMessage(chatId, `📅 *حجز موعد جديد*\n\nاكتب اسمك الكريم:`);

    } else if (msg === '2' || msg.includes('سعر') || msg.includes('خدمة')) {
      await sendMessage(chatId, `💰 *قائمة الأسعار والخدمات*\n${SERVICES}\n_* الأسعار تقديرية وقد تختلف حسب الحالة_`);
      await showMainMenu(chatId);

    } else if (msg === '3' || msg.includes('موقع') || msg.includes('عنوان')) {
      await sendMessage(chatId,
        `📍 *موقع العيادة*\n\n` +
        `🏥 ${CLINIC.address}\n` +
        `📞 ${CLINIC.phone}\n` +
        `🕒 ${CLINIC.hours}\n\n` +
        `https://maps.google.com`
      );
      await showMainMenu(chatId);

    } else if (msg === '4' || msg.includes('سؤال') || msg.includes('استفسار')) {
      userState[chatId] = 'faq';
      await sendMessage(chatId,
        `❓ *الأسئلة الشائعة*\n\n` +
        `1️⃣ هل في تخدير؟\n` +
        `2️⃣ كم وقت الجلسة؟\n` +
        `3️⃣ هل يوجد تأمين؟\n` +
        `4️⃣ طوارئ وألم شديد\n` +
        `0️⃣ رجوع للقائمة`
      );
    } else {
      await sendMessage(chatId, `مش فاهم 😅\nاكتب *مرحبا* للقائمة الرئيسية`);
    }
    return;
  }

  // ── الأسئلة الشائعة ──
  if (state === 'faq') {
    const faqs = {
      '1': `✅ *التخدير*\nكل العمليات بتتعمل تحت تخدير موضعي كامل — مش هتحس بأي ألم إن شاء الله 😊`,
      '2': `⏰ *وقت الجلسة*\n- كشف وتنظيف: ٣٠ دقيقة\n- حشو: ٤٥-٦٠ دقيقة\n- كراون: ساعة وربع\n- زراعة: من ساعة لساعتين`,
      '3': `💳 *التأمين*\nللأسف حاليًا العيادة مش متعاملة مع شركات التأمين، بس الأسعار معقولة جدًا ومنافسة 👍`,
      '4': `🚨 *طوارئ*\nفي حالات الألم الشديد، اتصل فورًا:\n📞 ${CLINIC.phone}\nهنخصصلك موعد في نفس اليوم إن شاء الله`,
      '0': null,
    };
    if (msg === '0') {
      userState[chatId] = 'menu';
      await showMainMenu(chatId);
    } else if (faqs[msg]) {
      await sendMessage(chatId, faqs[msg]);
      await showMainMenu(chatId);
    } else {
      await sendMessage(chatId, `اكتب رقم من ١ إلى ٤ أو ٠ للرجوع`);
    }
    return;
  }

  // ── حجز الموعد ──
  if (state === 'book_name') {
    userState[chatId] = 'book_phone';
    userState[chatId + '_booking'] = { name: msg };
    await sendMessage(chatId, `شكرًا يا *${msg}* 😊\nاكتب رقم موبايلك:`);
    return;
  }

  if (state === 'book_phone') {
    userState[chatId] = 'book_service';
    userState[chatId + '_booking'].phone = msg;
    await sendMessage(chatId,
      `اختار الخدمة المطلوبة:\n\n` +
      `1️⃣ حشو أسنان\n2️⃣ تبييض أسنان\n3️⃣ تركيب كراون\n` +
      `4️⃣ زراعة أسنان\n5️⃣ تقويم\n6️⃣ كشف وتنظيف\n7️⃣ قلع أسنان`
    );
    return;
  }

  if (state === 'book_service') {
    const services = { '1':'حشو أسنان','2':'تبييض أسنان','3':'تركيب كراون','4':'زراعة أسنان','5':'تقويم','6':'كشف وتنظيف','7':'قلع أسنان' };
    const service = services[msg] || msg;
    userState[chatId] = 'book_date';
    userState[chatId + '_booking'].service = service;
    await sendMessage(chatId, `اكتب التاريخ المناسب ليك:\n_مثال: ١٥ يونيو_`);
    return;
  }

  if (state === 'book_date') {
    userState[chatId] = 'book_time';
    userState[chatId + '_booking'].date = msg;
    await sendMessage(chatId,
      `اختار الوقت المناسب:\n\n` +
      `1️⃣ ١٠ صباحًا\n2️⃣ ١٢ ظهرًا\n3️⃣ ٢ عصرًا\n4️⃣ ٤ عصرًا\n5️⃣ ٦ مساءً\n6️⃣ ٨ مساءً`
    );
    return;
  }

  if (state === 'book_time') {
    const times = { '1':'١٠ صباحًا','2':'١٢ ظهرًا','3':'٢ عصرًا','4':'٤ عصرًا','5':'٦ مساءً','6':'٨ مساءً' };
    const time = times[msg] || msg;
    const b = userState[chatId + '_booking'];
    b.time = time;
    userState[chatId] = 'menu';

    await sendMessage(chatId,
      `✅ *تم استلام طلب حجزك!*\n\n` +
      `👤 الاسم: ${b.name}\n` +
      `🦷 الخدمة: ${b.service}\n` +
      `📅 التاريخ: ${b.date} – ${b.time}\n` +
      `📞 الموبايل: ${b.phone}\n\n` +
      `هنتصل بيك خلال ٣٠ دقيقة لتأكيد الموعد 😊`
    );
    return;
  }

  // Default
  await sendMessage(chatId, `اكتب *مرحبا* للقائمة الرئيسية 😊`);
}

async function showMainMenu(chatId) {
  userState[chatId] = 'menu';
  await sendMessage(chatId,
    `في حاجة تانية أقدر أساعدك فيها؟\n\n` +
    `1️⃣ حجز موعد\n2️⃣ الأسعار\n3️⃣ الموقع\n4️⃣ أسئلة`
  );
}

// ═══════════════════════════════════════════
//  Webhook — يستقبل الرسائل من Green API
// ═══════════════════════════════════════════
app.post('/webhook', async (req, res) => {
  res.sendStatus(200);
  const body = req.body;
  if (body.typeWebhook !== 'incomingMessageReceived') return;

  const chatId = body.senderData?.chatId;
  const text   = body.messageData?.textMessageData?.textMessage;
  if (!chatId || !text) return;

  console.log(`📩 رسالة من ${chatId}: ${text}`);
  await handleMessage(chatId, text);
});

app.get('/', (req, res) => res.send('🦷 بوت عيادة الأسنان شغال!'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ البوت شغال على بورت ${PORT}`));
