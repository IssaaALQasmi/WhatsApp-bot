/**
 * bot.js
 * الملف الرئيسي للبوت - يربط مكتبة الواتساب مع خدمات التذكير وتحليل الرسائل
 */

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const aiParser = require('./aiParser');
const reminderService = require('./reminderService');
const database = require('./database');
require('dotenv').config();

// تهيئة قاعدة البيانات
database.initializeDatabase();

// إنشاء عميل الواتساب
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  }
});

// معالجة إنشاء رمز QR للمصادقة
client.on('qr', (qr) => {
  console.log('امسح رمز QR التالي باستخدام تطبيق واتساب على هاتفك:');
  qrcode.generate(qr, { small: true });
});

// عند جاهزية العميل
client.on('ready', () => {
  console.log('تم تسجيل الدخول بنجاح! البوت جاهز للعمل.');
  
  // تعيين عميل الواتساب في خدمة التذكير
  reminderService.setWhatsappClient(client);
  
  // إعادة جدولة التذكيرات الموجودة مسبقًا
  reminderService.rescheduleAllReminders();
});

// معالجة الرسائل الواردة
client.on('message', async (message) => {
  try {
    // تجاهل الرسائل من المجموعات
    if (message.isGroupMsg) return;
    
    const userPhone = message.from;
    const messageContent = message.body.trim();
    
    // إذا كانت الرسالة فارغة، نتجاهلها
    if (!messageContent) return;
    
    console.log(`رسالة واردة من ${userPhone}: ${messageContent}`);
    
    // إذا كانت الرسالة تبدأ بكلمة خاصة مثل "تذكير" أو "ذكرني"
    if (messageContent.match(/^(تذكير|ذكرني|reminder)/i)) {
      console.log('معالجة طلب تذكير...');
      
      // تحليل رسالة المستخدم باستخدام الذكاء الاصطناعي
      const parsedReminder = await aiParser.parseReminderMessage(messageContent);
      
      // إنشاء كائن التذكير
      const reminderData = {
        userPhone,
        reminderText: parsedReminder.reminderText,
        reminderTime: parsedReminder.reminderTime
      };
      
      // جدولة التذكير
      const savedReminder = await reminderService.scheduleReminder(reminderData);
      
      if (savedReminder) {
        // تحويل وقت التذكير إلى تنسيق أكثر قابلية للقراءة
        const readableTime = new Date(savedReminder.reminderTime).toLocaleString('ar-SA', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
        
        // إرسال رسالة تأكيد للمستخدم
        await client.sendMessage(userPhone, 
          `✅ تم تعيين التذكير بنجاح!\n\n` +
          `📝 *المحتوى:* ${savedReminder.reminderText}\n` +
          `⏰ *الوقت:* ${readableTime}\n\n` +
          `سأقوم بتذكيرك في الوقت المحدد. 👍`
        );
      } else {
        // إرسال رسالة خطأ للمستخدم
        await client.sendMessage(userPhone, 
          `❌ عذرًا، لم أتمكن من إضافة التذكير. يرجى المحاولة مرة أخرى بصيغة مختلفة.\n\n` +
          `مثال: "ذكرني بموعد الطبيب غدًا الساعة 3 مساءً"`
        );
      }
    } 
    // إذا كان المستخدم يطلب مشاهدة التذكيرات القادمة
    else if (messageContent.match(/^(التذكيرات|عرض التذكيرات|تذكيراتي)/i)) {
      const userReminders = database.getUserReminders(userPhone);
      
      if (userReminders.length === 0) {
        await client.sendMessage(userPhone, "لا يوجد لديك أي تذكيرات مجدولة حاليًا. 📅");
      } else {
        // فرز التذكيرات حسب الوقت
        const sortedReminders = userReminders.sort((a, b) => {
          return new Date(a.reminderTime) - new Date(b.reminderTime);
        });
        
        let remindersList = "📋 *قائمة التذكيرات المجدولة:*\n\n";
        
        sortedReminders.forEach((reminder, index) => {
          const readableTime = new Date(reminder.reminderTime).toLocaleString('ar-SA', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          });
          
          remindersList += `*${index + 1}. ${reminder.reminderText}*\n` +
                          `⏰ ${readableTime}\n\n`;
        });
        
        await client.sendMessage(userPhone, remindersList);
      }
    } 
    // رسالة المساعدة عند إرسال أي رسالة أخرى
    else {
      await client.sendMessage(userPhone, 
        `👋 مرحبًا بك في بوت التذكير!\n\n` +
        `لإضافة تذكير جديد، أرسل رسالة تبدأ بكلمة "ذكرني" أو "تذكير" متبوعة بمحتوى التذكير والوقت.\n\n` +
        `مثال: "ذكرني بموعد الطبيب غدًا الساعة 3 مساءً"\n\n` +
        `لعرض التذكيرات المجدولة، أرسل "تذكيراتي" أو "عرض التذكيرات"`
      );
    }
  } catch (error) {
    console.error('خطأ في معالجة الرسالة:', error);
    try {
      await client.sendMessage(message.from, 
        "عذرًا، حدث خطأ أثناء معالجة طلبك. يرجى المحاولة مرة أخرى لاحقًا."
      );
    } catch (sendError) {
      console.error('خطأ في إرسال رسالة الخطأ:', sendError);
    }
  }
});

// معالجة الأخطاء
client.on('auth_failure', (msg) => {
  console.error('فشل المصادقة:', msg);
});

client.on('disconnected', (reason) => {
  console.log('تم قطع الاتصال بالواتساب:', reason);
  reminderService.cancelAllScheduledJobs();
  
  // إعادة تشغيل العميل
  console.log('محاولة إعادة الاتصال...');
  client.initialize();
});

// بدء تشغيل العميل
console.log('جاري بدء تشغيل بوت التذكير...');
client.initialize();

// معالجة إنهاء التطبيق
process.on('SIGINT', async () => {
  console.log('جاري إيقاف بوت التذكير...');
  reminderService.cancelAllScheduledJobs();
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  console.error('خطأ غير معالج:', error);
});

// تصدير العميل لاستخدامه في ملفات أخرى إذا لزم الأمر
module.exports = {
  client
};
