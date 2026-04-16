const mongoose = require('mongoose');
require('dotenv').config();

const AccessCode = require('./models/AccessCode');

mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(async () => {
  console.log('✅ Connected to MongoDB');
  
  const result = await AccessCode.deleteMany({});
  console.log(`🗑️  Deleted ${result.deletedCount} access codes`);
  
  process.exit(0);
}).catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
