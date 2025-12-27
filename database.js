/**
 * database.js
 * مسؤول عن إدارة التخزين وعمليات قراءة وكتابة التذكيرات في ملف JSON
 */

const fs = require('fs');
require('dotenv').config();

// مسار ملف التخزين
const DB_FILE_PATH = process.env.DB_FILE_PATH || './reminders.json';

// التأكد من وجود ملف قاعدة البيانات
const initializeDatabase = () => {
  if (!fs.existsSync(DB_FILE_PATH)) {
    fs.writeFileSync(DB_FILE_PATH, JSON.stringify({ reminders: [] }));
    console.log('تم إنشاء ملف قاعدة البيانات');
  }
};

// الحصول على جميع التذكيرات
const getAllReminders = () => {
  try {
    initializeDatabase();
    const data = fs.readFileSync(DB_FILE_PATH);
    return JSON.parse(data).reminders || [];
  } catch (error) {
    console.error('خطأ في قراءة قاعدة البيانات:', error);
    return [];
  }
};

// إضافة تذكير جديد
const addReminder = (reminder) => {
  try {
    initializeDatabase();
    const reminders = getAllReminders();
    const newReminder = {
      id: Date.now().toString(),
      ...reminder,
      createdAt: new Date().toISOString()
    };
    reminders.push(newReminder);
    
    fs.writeFileSync(DB_FILE_PATH, JSON.stringify({ reminders }, null, 2));
    return newReminder;
  } catch (error) {
    console.error('خطأ في إضافة التذكير:', error);
    return null;
  }
};

// حذف تذكير بواسطة المعرّف
const deleteReminder = (reminderId) => {
  try {
    const reminders = getAllReminders();
    const filteredReminders = reminders.filter(r => r.id !== reminderId);
    
    if (reminders.length === filteredReminders.length) {
      return false; // لم يتم العثور على التذكير
    }
    
    fs.writeFileSync(DB_FILE_PATH, JSON.stringify({ reminders: filteredReminders }, null, 2));
    return true;
  } catch (error) {
    console.error('خطأ في حذف التذكير:', error);
    return false;
  }
};

// الحصول على تذكيرات مستخدم محدد
const getUserReminders = (userPhoneNumber) => {
  const reminders = getAllReminders();
  return reminders.filter(reminder => reminder.userPhone === userPhoneNumber);
};

module.exports = {
  initializeDatabase,
  getAllReminders,
  addReminder,
  deleteReminder,
  getUserReminders
};
