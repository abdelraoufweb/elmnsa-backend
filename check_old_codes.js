require('dotenv').config();
const mongoose = require('mongoose');
const SecurityLog = require('./models/SecurityLog');
const WhatsAppLog = require('./models/WhatsAppLog');

async function main() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log('✅ Connected\n');

    console.log('=== SecurityLog mentions of access codes ===');
    const secLogs = await SecurityLog.find(
      { description: /code/i },
      'type description createdAt'
    ).sort({ createdAt: -1 }).limit(50).lean();
    secLogs.forEach(l => console.log(`[${l.type}] ${new Date(l.createdAt).toISOString()} :: ${l.description}`));

    console.log('\n=== WhatsAppLog mentions of codes ===');
    const waLogs = await WhatsAppLog.find(
      { $or: [{ message: /كود|code/i }, { body: /كود|code/i }] },
      'phoneNumber message body status createdAt'
    ).sort({ createdAt: -1 }).limit(50).lean();
    waLogs.forEach(l => console.log(`[${l.phoneNumber}] ${new Date(l.createdAt).toISOString()} :: ${l.message || l.body}`));
  } catch (err) {
    console.error('❌ Error:', err.message, err.stack?.split('\n')[1] || '');
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

main();