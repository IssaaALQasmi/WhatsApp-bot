/**
 * aiParser.js
 * مسؤول عن تحليل رسائل المستخدم واستخراج معلومات التذكير (النص، الوقت) باستخدام الذكاء الاصطناعي
 */

const axios = require('axios');
const moment = require('moment-timezone');
require('dotenv').config();

// تكوين المنطقة الزمنية
const timezone = process.env.TIMEZONE || 'Asia/Riyadh';
moment.tz.setDefault(timezone);

/**
 * تحليل رسالة المستخدم باستخدام DeepSeek AI (يمكن استبدالها بـ OpenAI)
 * @param {string} message - رسالة المستخدم
 * @returns {Promise<Object>} - نتيجة التحليل (نص التذكير، وقت التذكير)
 */
async function parseReminderMessage(message) {
  try {
    console.log('بدء تحليل الرسالة:', message);
    
    // استخدام DeepSeek AI للتحليل (يمكن استبداله بـ OpenAI)
    const response = await axios.post(
      'https://api.deepseek.com/v1/chat/completions', // قم بتغيير هذا الرابط إلى رابط API المستخدم
      {
        model: "deepseek-chat", // يمكن تغييره حسب النموذج المتاح
        messages: [
          {
            role: "system",
            content: `أنت مساعد يقوم بتحليل رسائل تذكير باللغة العربية. استخرج التفاصيل التالية:
            1. نص التذكير (ما الذي يريد المستخدم أن يتذكره)
            2. وقت التذكير (التاريخ والساعة)
            
            أعد النتيجة بتنسيق JSON فقط بهذا الشكل، بدون تنسيق markdown:
            {
              "reminderText": "نص التذكير",
              "reminderTime": "yyyy-MM-dd HH:mm:ss" (بتنسيق ISO)
            }
            
            إذا كان الوقت غير واضح أو غير محدد، استخدم الوقت الافتراضي بعد 5 دقائق من الآن.
            الوقت الحالي هو: ${moment().format('YYYY-MM-DD HH:mm:ss')}`
          },
          {
            role: "user",
            content: message
          }
        ]
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.AI_API_KEY}`
        }
      }
    );

    // في حالة استخدام OpenAI، يمكن تعديل طريقة التعامل مع الاستجابة
    if (response.data && response.data.choices && response.data.choices[0]) {
      let content = response.data.choices[0].message.content;
      
      // تنظيف المحتوى من أي تنسيق markdown
      content = content
        .replace(/```(json|.*)?\n/g, '') // إزالة بداية كود JSON markdown
        .replace(/```/g, '') // إزالة نهاية كود markdown
        .trim(); // إزالة المسافات الزائدة
      
      console.log('المحتوى بعد التنظيف:', content);
      
      try {
        const parsedData = JSON.parse(content);
        
        // التحقق من صحة البيانات
        if (parsedData.reminderText && parsedData.reminderTime) {
          // التحقق من صحة تنسيق الوقت
          const parsedTime = moment(parsedData.reminderTime);
          if (parsedTime.isValid()) {
            // إذا كان الوقت في الماضي، نضيف يوم واحد
            if (parsedTime.isBefore(moment())) {
              if (parsedTime.isSame(moment(), 'day')) {
                // إذا كان نفس اليوم، نفترض أنه يقصد اليوم التالي
                parsedTime.add(1, 'day');
              }
            }
            parsedData.reminderTime = parsedTime.format();
            return parsedData;
          }
        }
      } catch (jsonError) {
        console.error('خطأ في تحليل JSON بعد التنظيف:', jsonError, '\nالمحتوى:', content);
      }
    }
    // في حالة فشل تحليل الرد أو عدم وجود بيانات صحيحة
    console.log('فشل تحليل الرد، استخدام التحليل البسيط');
    return fallbackParseMessage(message);
  } catch (error) {
    console.error('خطأ في الاتصال بخدمة الذكاء الاصطناعي:', error);
    
    // محاولة تحليل بسيطة في حالة فشل API
    return fallbackParseMessage(message);
  }
}

/**
 * تحليل الرسالة بشكل بسيط في حالة فشل الاتصال بخدمة الذكاء الاصطناعي
 * @param {string} message - رسالة المستخدم
 * @returns {Object} - نتيجة التحليل البسيط
 */
function fallbackParseMessage(message) {
  // تنفيذ تحليل بسيط للرسالة
  // البحث عن كلمات دالة على الوقت (الساعة، غدًا، اليوم، الخ)
  let reminderText = message;
  let reminderTime = moment().add(5, 'minutes'); // افتراضي: بعد 5 دقائق من الآن بدلاً من ساعة
  
  // البحث عن تنسيقات الوقت المعروفة
  // مثال: "الساعة 3" أو "3:00" أو "غدًا 5 مساءً"
  const timeRegexes = [
    { regex: /الساعة\s+(\d{1,2})(?::(\d{1,2}))?(?:\s+(صباحًا|صباحا|مساءً|مساء))?/i, handler: handleTimeMatch },
    { regex: /(\d{1,2})(?::(\d{1,2}))?(?:\s+(صباحًا|صباحا|مساءً|مساء))?/i, handler: handleTimeMatch },
    { regex: /غدًا|غدا/i, handler: () => moment().add(1, 'day').hour(9).minute(0) },
    { regex: /بعد\s+(\d+)\s+ساعات?/i, handler: (match) => moment().add(parseInt(match[1]), 'hours') },
    { regex: /بعد\s+(\d+)\s+دقائق?/i, handler: (match) => moment().add(parseInt(match[1]), 'minutes') }
  ];
  
  // تطبيق كل تعبير نمطي على الرسالة
  for (const { regex, handler } of timeRegexes) {
    const match = message.match(regex);
    if (match) {
      reminderTime = handler(match);
      break;
    }
  }
  
  return {
    reminderText,
    reminderTime: reminderTime.format()
  };
}

/**
 * معالجة تطابق صيغة الوقت (الساعة X)
 * @param {Array} match - نتيجة التطابق من التعبير النمطي
 * @returns {Object} - كائن moment يمثل الوقت
 */
function handleTimeMatch(match) {
  let hour = parseInt(match[1]);
  const minute = match[2] ? parseInt(match[2]) : 0;
  const period = match[3] || '';
  
  // التحقق من الفترة (صباحًا/مساءً)
  if ((period.startsWith('م') && hour < 12) || 
      (hour < 12 && !period && hour >= 7 && hour <= 11)) {
    hour += 12; // تحويل إلى نظام 24 ساعة للوقت المسائي
  }
  
  // إنشاء كائن الوقت
  const time = moment().hour(hour).minute(minute).second(0);
  
  // إذا كان الوقت في الماضي، نضيف يوم واحد
  if (time.isBefore(moment())) {
    time.add(1, 'day');
  }
  
  return time;
}

module.exports = {
  parseReminderMessage
};
