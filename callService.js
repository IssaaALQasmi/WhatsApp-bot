/**
 * خدمة الاتصال باستخدام مكتبة Baileys
 * هذا الملف مسؤول فقط عن عمل اتصال مع جهات الاتصال
 */

const { default: makeWASocket, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');

// تجاهل سجلات التشخيص غير الضرورية
const logger = pino({ level: 'silent' });
let sock = null;
let isConnected = false;
let connectionAttempts = 0;

/**
 * إنشاء اتصال بواتساب
 */
async function connectBailey() {
  try {
    // تحقق من وجود ملف الجلسة
    const sessionDir = path.join(__dirname, 'baileys_auth_info');
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    // إنشاء اتصال جديد
    sock = makeWASocket({
      auth: {
        creds: {},
        keys: {}
      },
      printQRInTerminal: true,
      logger
    });

    // معالجة حدث الاتصال
    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect } = update;

      if (connection === 'close') {
        const shouldReconnect =
          lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
        console.log('اتصال Baileys مغلق بسبب: ', lastDisconnect?.error);
        if (shouldReconnect && connectionAttempts < 5) {
          connectionAttempts++;
          connectBailey();
        }
      } else if (connection === 'open') {
        console.log('تم الاتصال بنجاح بخدمة Baileys للاتصال');
        isConnected = true;
        connectionAttempts = 0;
      }
    });

    return sock;
  } catch (err) {
    console.error('خطأ في الاتصال بخدمة Baileys:', err);
    return null;
  }
}

/**
 * إجراء اتصال بالمستخدم (رنّة)
 * @param {string} phoneNumber - رقم الهاتف بتنسيق WhatsApp (يجب أن يتضمن رمز الدولة)
 * @returns {Promise<boolean>} - نجاح أو فشل الاتصال
 */
async function makeCall(phoneNumber) {
  try {
    // إذا لم يكن هناك اتصال، قم بالاتصال أولاً
    if (!sock || !isConnected) {
      sock = await connectBailey();
      // انتظر حتى يتم الاتصال
      console.log('جاري الاتصال بخدمة Baileys للاتصال...');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    if (!sock || !isConnected) {
      console.error('فشل الاتصال بخدمة Baileys');
      return false;
    }

    // تأكد من أن رقم الهاتف منسق بشكل صحيح (إزالة "@c.us" إذا كان موجوداً)
    const formattedPhone = phoneNumber.replace('@c.us', '');

    // استخدم طريقة sendCall من المكتبة إذا كانت موجودة
    if (sock.sendCall) {
      console.log(`محاولة الاتصال بـ ${formattedPhone}...`);
      const callResult = await sock.sendCall({
        from: sock.user.id,
        to: formattedPhone,
        isVideo: false,
        isGroup: false
      });
      
      console.log('نتيجة الاتصال:', callResult);
      return true;
    } else {
      console.log('وظيفة الاتصال غير متوفرة في هذا الإصدار من المكتبة');
      return false;
    }
  } catch (error) {
    console.error('خطأ أثناء محاولة الاتصال:', error);
    return false;
  }
}

/**
 * إنهاء الاتصال بعد فترة قصيرة
 * @param {string} phoneNumber - رقم الهاتف
 * @param {number} duration - المدة بالمللي ثانية قبل إنهاء الاتصال
 */
async function makeRingCall(phoneNumber, duration = 5000) {
  try {
    // بدء الاتصال
    const callStarted = await makeCall(phoneNumber);
    
    if (callStarted) {
      console.log(`تم بدء الاتصال بـ ${phoneNumber}، سيتم إنهاؤه بعد ${duration}ms`);
      
      // إنهاء الاتصال بعد الفترة المحددة
      setTimeout(async () => {
        try {
          if (sock && sock.endCall) {
            await sock.endCall(phoneNumber);
            console.log(`تم إنهاء الاتصال بـ ${phoneNumber}`);
          }
        } catch (endError) {
          console.error('خطأ في إنهاء الاتصال:', endError);
        }
      }, duration);
      
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('خطأ في إجراء اتصال الرنّة:', error);
    return false;
  }
}

module.exports = {
  makeRingCall,
  connectBailey
};
