require('dotenv').config();
const mongoose = require('mongoose');

console.log('🔍 Testing MongoDB Connection...\n');
console.log('URI:', process.env.MONGODB_URI.substring(0, 60) + '...\n');

mongoose.connect(process.env.MONGODB_URI, {
  serverSelectionTimeoutMS: 5000
}).then(() => {
  console.log('✅ MongoDB Connected Successfully!');
  console.log('Database:', mongoose.connection.db.name);
  console.log('Host:', mongoose.connection.host);
  process.exit(0);
}).catch(err => {
  console.log('❌ MongoDB Connection Failed!');
  console.log('Error:', err.message);
  if (err.message.includes('authentication failed')) {
    console.log('\n⚠️  Issue: Wrong username/password or user not authorized');
  } else if (err.message.includes('ENOTFOUND')) {
    console.log('\n⚠️  Issue: DNS resolution failed (check internet)');
  } else if (err.message.includes('ECONNREFUSED')) {
    console.log('\n⚠️  Issue: Connection refused (check IP whitelist)');
  }
  process.exit(1);
});
