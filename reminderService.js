/**
 * reminderService.js
 * مسؤول عن جدولة وإدارة وإرسال التذكيرات في الأوقات المحددة
 */

const schedule = require('node-schedule');
const moment = require('moment-timezone');
const database = require('./database');
require('dotenv').config();

// عميل واتساب (سيتم تعيينه من bot.js)
let whatsappClient = null;

// قائمة المهام المجدولة لسهولة إلغائها
const scheduledJobs = {};

/**
 * تعيين مرجع عميل الواتساب
 * @param {Object} client - عميل الواتساب من whatsapp-web.js
 */
const setWhatsappClient = (client) => {
  whatsappClient = client;
  console.log('تم تعيين عميل الواتساب في خدمة التذكير');
};

/**
 * إرسال تذكير عبر الواتساب
 * @param {Object} reminder - كائن التذكير
 */
const sendReminder = async (reminder) => {
  if (!whatsappClient) {
    console.error('عميل الواتساب غير متوفر');
    return;
  }

  try {
    const { userPhone, reminderText } = reminder;
    console.log(`جاري إرسال تذكير إلى ${userPhone}: ${reminderText}`);
    
    // استراتيجية محاكاة الاتصال عبر سلسلة من الإشعارات المتتالية سريعة
    try {
      console.log(`تنفيذ محاكاة رنّة للمستخدم ${userPhone}...`);
      
      // إرسال رسالة الجرس الأولى (تولد إشعارًا وصوتًا)
      await whatsappClient.sendMessage(userPhone, '📲 *تنبيه!* 📲');
      
      // انتظر نصف ثانية ثم أرسل رسالة ثانية (تنبيه آخر)
      setTimeout(async () => {
        try {
          await whatsappClient.sendMessage(userPhone, '🔔🔔🔔');
        } catch (err) {
          console.error('خطأ في إرسال الرسالة الثانية:', err);
        }
      }, 500);
      
      // انتظر نصف ثانية أخرى ثم أرسل رسالة ثالثة (تنبيه ثالث)
      setTimeout(async () => {
        try {
          await whatsappClient.sendMessage(userPhone, '📱 *رنة* 📱');
        } catch (err) {
          console.error('خطأ في إرسال الرسالة الثالثة:', err);
        }
      }, 1000);
      
      // محاولة إجراء اتصال عبر المكتبة الحالية إذا كانت الوظيفة متوفرة
      if (whatsappClient.startCall) {
        try {
          console.log(`محاولة إجراء اتصال مباشر لـ ${userPhone}...`);
          await whatsappClient.startCall(userPhone, { isVideo: false, duration: 3000 });
          console.log(`تم إرسال طلب الاتصال لـ ${userPhone}`);
        } catch (callErr) {
          console.log('لا يمكن إجراء اتصال مباشر:', callErr.message);
        }
      }
    } catch (error) {
      console.error('خطأ في محاكاة الرنة:', error);
    }

    // انتظر 1.5 ثانية ثم أرسل رسالة التذكير الرئيسية (بعد سلسلة الرنات)
    setTimeout(async () => {
      try {
        // إرسال رسالة التذكير بشكل واضح وملحوظ
        await whatsappClient.sendMessage(userPhone, `⏰ *تذكير مهم!* ⏰\n\n*${reminderText}*\n\n_الرجاء الانتباه لهذا التذكير_`);
        console.log(`تم إرسال تذكير إلى ${userPhone}: ${reminderText}`);
        
        // بعد 2 ثانية أخرى، أرسل تذكيرًا نهائيًا لضمان عدم تجاهل الرسالة
        setTimeout(async () => {
          try {
            await whatsappClient.sendMessage(userPhone, '⚠️ *لا تنسى التذكير المهم أعلاه!* ⚠️');
          } catch (error) {
            console.error('خطأ في إرسال الرسالة النهائية:', error);
          }
        }, 2000);
      } catch (msgError) {
        console.error('خطأ في إرسال رسالة التذكير الرئيسية:', msgError);
      }
    }, 1500);
    
    // حذف التذكير من قاعدة البيانات بعد إرساله
    await database.deleteReminder(reminder.id);
    console.log(`تم حذف التذكير ${reminder.id} بعد إرساله`);
    
    // إلغاء المهمة المجدولة
    if (scheduledJobs[reminder.id]) {
      scheduledJobs[reminder.id].cancel();
      delete scheduledJobs[reminder.id];
    }
  } catch (error) {
    console.error('خطأ في إرسال التذكير:', error);
  }
};

/**
 * جدولة تذكير جديد
 * @param {Object} reminderData - بيانات التذكير (النص، الوقت، رقم الهاتف)
 * @returns {Object|null} - التذكير المضاف أو null في حالة الفشل
 */
const scheduleReminder = async (reminderData) => {
  try {
    // حفظ التذكير في قاعدة البيانات
    const reminder = database.addReminder(reminderData);
    
    if (!reminder) {
      console.error('فشل في إضافة التذكير إلى قاعدة البيانات');
      return null;
    }
    
    // تحويل وقت التذكير إلى Date
    const reminderTime = new Date(reminder.reminderTime);
    
    // التأكد من أن الوقت في المستقبل
    if (reminderTime <= new Date()) {
      console.warn('وقت التذكير في الماضي، سيتم إرساله فوراً:', reminder);
      // إرسال التذكير فوراً إذا كان وقته في الماضي
      await sendReminder(reminder);
      return reminder;
    }
    
    // جدولة المهمة باستخدام node-schedule
    const job = schedule.scheduleJob(reminder.id, reminderTime, async () => {
      console.log(`تنفيذ التذكير المجدول ${reminder.id}`);
      await sendReminder(reminder);
    });
    
    // تخزين مرجع المهمة المجدولة
    scheduledJobs[reminder.id] = job;
    
    console.log(`تمت جدولة تذكير ${reminder.id} في ${reminderTime}`);
    return reminder;
  } catch (error) {
    console.error('خطأ في جدولة التذكير:', error);
    return null;
  }
};

/**
 * إعادة جدولة جميع التذكيرات من قاعدة البيانات (تستخدم عند بدء تشغيل البوت)
 */
const rescheduleAllReminders = async () => {
  try {
    const reminders = database.getAllReminders();
    console.log(`إعادة جدولة ${reminders.length} تذكير(ات) من قاعدة البيانات`);
    
    for (const reminder of reminders) {
      // التأكد من أن وقت التذكير في المستقبل
      const reminderTime = new Date(reminder.reminderTime);
      
      if (reminderTime <= new Date()) {
        console.log(`التذكير ${reminder.id} مر وقته، سيتم إرساله فوراً`);
        await sendReminder(reminder);
      } else {
        const job = schedule.scheduleJob(reminder.id, reminderTime, async () => {
          console.log(`تنفيذ التذكير المجدول ${reminder.id}`);
          await sendReminder(reminder);
        });
        
        scheduledJobs[reminder.id] = job;
        console.log(`تمت إعادة جدولة التذكير ${reminder.id} في ${reminderTime}`);
      }
    }
    
    console.log('تمت إعادة جدولة جميع التذكيرات بنجاح');
  } catch (error) {
    console.error('خطأ في إعادة جدولة التذكيرات:', error);
  }
};

/**
 * معرفة وقت التذكير القادم لمستخدم معين
 * @param {string} userPhone - رقم هاتف المستخدم
 * @returns {Object|null} - معلومات التذكير القادم أو null إذا لم يكن هناك تذكير
 */
const getNextReminderForUser = (userPhone) => {
  try {
    const userReminders = database.getUserReminders(userPhone);
    
    if (!userReminders.length) {
      return null;
    }
    
    // فرز التذكيرات حسب الوقت (تصاعدياً)
    const sortedReminders = userReminders.sort((a, b) => {
      return new Date(a.reminderTime) - new Date(b.reminderTime);
    });
    
    // البحث عن أول تذكير في المستقبل
    const now = new Date();
    const futureReminders = sortedReminders.filter(r => new Date(r.reminderTime) > now);
    
    if (futureReminders.length > 0) {
      return futureReminders[0];
    }
    
    return null;
  } catch (error) {
    console.error('خطأ في الحصول على التذكير القادم للمستخدم:', error);
    return null;
  }
};

/**
 * إلغاء جميع التذكيرات المجدولة
 */
const cancelAllScheduledJobs = () => {
  Object.values(scheduledJobs).forEach(job => job.cancel());
  Object.keys(scheduledJobs).forEach(id => delete scheduledJobs[id]);
  console.log('تم إلغاء جميع المهام المجدولة');
};

module.exports = {
  setWhatsappClient,
  scheduleReminder,
  rescheduleAllReminders,
  getNextReminderForUser,
  cancelAllScheduledJobs
};
