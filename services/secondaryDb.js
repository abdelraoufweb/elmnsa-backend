const mongoose = require('mongoose');

// The secondary database URI provided by the user for exam images
const URI = process.env.MONGODB_URI_SECONDARY || "mongodb+srv://q7medquality_db_user:NLsdWCDgl8MoDkCF@cluster0.yielfiu.mongodb.net/exam_images?retryWrites=true&w=majority";

const secondaryDbConnection = mongoose.createConnection(URI, {
  maxPoolSize: 20,
  serverSelectionTimeoutMS: 5000,
});

secondaryDbConnection.on('connected', () => {
  console.log('✅ Secondary MongoDB (Logs/Load Balancer) connected successfully');
});

secondaryDbConnection.on('error', (err) => {
  console.error('❌ Secondary MongoDB connection error:', err.message);
});

module.exports = secondaryDbConnection;
