const TelegramBot = require('node-telegram-bot-api');
const { initializeApp } = require('firebase/app');
const { getDatabase, ref, get, onValue } = require('firebase/database');

// 🔹 توكن البوت
const token = '8267706399:AAH-wT8B6KsS46P8YrkQOJSowoxDgng5pU0';

// 🔹 إعداد البوت
const bot = new TelegramBot(token, { polling: true });

// 🔹 إعداد Firebase
const firebaseConfig = {
  apiKey: "AIzaSyCx4DUJv8n5FEB3HGGBR_M4rOtGHNTdoGc",
  authDomain: "red-ux.firebaseapp.com",
  databaseURL: "https://red-ux-default-rtdb.firebaseio.com/",
  projectId: "red-ux",
  storageBucket: "gs://red-ux.appspot.com",
  appId: "1:807036825698:android:c0d65b4fc65e71b9c9e13b"
};

// 🔹 تهيئة التطبيق
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

console.log("✅ Bot is running and connected to Firebase...");

// 🔹 تحويل الأرقام العربية للإنجليزية
function normalizeNumbers(str) {
  return str.replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
}

// 🔹 وصف الحالات
function getStatusDetails(status) {
  switch (status) {
    case 'قيد المراجعة':
      return { emoji: '📦', text: 'طلبك تحت المراجعة حالياً، وفريقنا بيتأكد من التفاصيل قبل التنفيذ.' };
    case 'قيد التنفيذ':
      return { emoji: '🕒', text: 'طلبك بيتم تجهيزه حالياً داخل المخزن، وهنبعتلك إشعار أول ما يتم الشحن.' };
    case 'جاري الشحن':
      return { emoji: '🚚', text: 'طلبك في الطريق ليك حالياً. تقدر تتابعه من خلال رقم التتبع قريبًا.' };
    case 'تم التسليم':
      return { emoji: '✅', text: 'تم تسليم طلبك بنجاح. شكراً على ثقتك في RED ❤️' };
    case 'تم الإلغاء':
      return { emoji: '❌', text: 'تم إلغاء الطلب بناءً على طلبك أو لعدم إتمام الدفع.' };
    default:
      return null;
  }
}

// 🗂️ العملاء المتابعين
const orderWatchers = {};
const lastStatuses = {};

// 🔹 استقبال الرسائل
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  let text = msg.text?.trim();
  if (!text) return;

  if (text === '/start') {
    bot.sendMessage(
      chatId,
      `👋 أهلاً بيك في بوت متابعة الطلبات الخاص بـ *RED* 🇪🇬\n\n📦 ابعت رقم الطلب المكون من 7 أرقام علشان تعرف حالته.`,
      { parse_mode: 'Markdown' }
    );
    return;
  }

  text = normalizeNumbers(text);

  // ✅ تحقق إن الرسالة رقم طلب
  if (!/^\d{7}$/.test(text)) {
    bot.sendMessage(chatId, '🤖 أنا متخصص لمتابعة الطلب فقط.\n📦 من فضلك ابعت رقم الطلب المكوّن من 7 أرقام.');
    return;
  }

  const orderId = text;
  bot.sendMessage(chatId, `🔍 جاري البحث عن الطلب رقم ${orderId}...`);

  try {
    const snapshot = await get(ref(db, 'orders1'));
    if (snapshot.exists()) {
      const data = snapshot.val();
      let foundOrder = null;
      let orderKey = null;

      for (const key in data) {
        if (data[key].id == orderId) {
          foundOrder = data[key];
          orderKey = key;
          break;
        }
      }

      if (foundOrder) {
        const statusInfo = getStatusDetails(foundOrder.status);

        if (!statusInfo) {
          bot.sendMessage(chatId, `⚠️ حالة الطلب غير معروفة حالياً.`);
          return;
        }

        // ✅ إنشاء الأزرار
        let buttons = [
          [{ text: '📦 متابعة الطلب', callback_data: 'track' }],
          [{ text: '⚡ استعجال الطلب', callback_data: 'speed' }],
          [{ text: '❌ إلغاء الطلب', callback_data: 'cancel' }]
        ];

        // ✅ لو الحالة "قيد التنفيذ" → حذف زر الإلغاء
        if (foundOrder.status === 'قيد التنفيذ') {
          buttons = buttons.filter(row => row[0].callback_data !== 'cancel');
        }

        // ✅ رسالة تفاصيل الطلب الكاملة
        const messageText = `
${statusInfo.emoji} *تفاصيل طلبك:*

🆔 *رقم الطلب:* ${foundOrder.id}
💰 *المبلغ:* ${foundOrder.amount || 'غير محدد'}
📅 *التاريخ:* ${foundOrder.date || 'غير متوفر'}
📦 *الحالة الحالية:* ${foundOrder.status}

${statusInfo.text}
`;

        bot.sendMessage(chatId, messageText, {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: buttons }
        });

        // حفظ المتابع
        orderWatchers[orderKey] = orderWatchers[orderKey] || [];
        if (!orderWatchers[orderKey].includes(chatId)) {
          orderWatchers[orderKey].push(chatId);
        }

        // حفظ آخر حالة
        lastStatuses[orderKey] = foundOrder.status;
      } else {
        bot.sendMessage(chatId, `❌ مفيش طلب برقم ${orderId}`);
      }
    } else {
      bot.sendMessage(chatId, '⚠️ قاعدة البيانات فاضية.');
    }
  } catch (error) {
    console.error(error);
    bot.sendMessage(chatId, '🚨 حصل خطأ أثناء الاتصال بقاعدة البيانات.');
  }
});

// 🔹 التعامل مع الأزرار
bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  const action = query.data;

  if (action === 'track') {
    bot.sendMessage(chatId, '📦 الطلب تحت المتابعة حالياً...');
  } else if (action === 'speed') {
    bot.sendMessage(chatId, '⚡ تم إرسال طلب استعجال لفريق RED.');
  } else if (action === 'cancel') {
    bot.sendMessage(chatId, '❌ تم إرسال طلب الإلغاء وسيتم مراجعته من فريق RED.');
  }

  bot.answerCallbackQuery(query.id);
});

// 🔥 إشعارات التحديث التلقائي
onValue(ref(db, 'orders1'), (snapshot) => {
  const data = snapshot.val();
  if (!data) return;

  for (const key in data) {
    const order = data[key];
    const newStatus = order.status;
    const oldStatus = lastStatuses[key];

    // ✅ فقط لو الحالة اتغيرت فعلاً
    if (newStatus && oldStatus && newStatus !== oldStatus) {
      const statusInfo = getStatusDetails(newStatus);
      if (statusInfo && orderWatchers[key]) {
        for (const chatId of orderWatchers[key]) {
          const now = new Date().toLocaleString('ar-EG', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'long' });
          bot.sendMessage(
            chatId,
            `🔔 *تحديث جديد لحالة طلبك*\n\n${statusInfo.emoji} *${newStatus}*\n${statusInfo.text}\n\n📅 *تم التحديث:* ${now}`,
            { parse_mode: 'Markdown' }
          );
        }
      }
      lastStatuses[key] = newStatus;
    }
  }
});