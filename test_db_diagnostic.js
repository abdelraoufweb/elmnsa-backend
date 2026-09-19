const mongoose = require('mongoose');
require('dotenv').config();

const uri = "mongodb+srv://abdelraouf:abdelraoufweb0100@abdelraouf.c176sqk.mongodb.net/elmnsa?retryWrites=true&w=majority&appName=abdelraouf";

async function testConnection() {
    console.log('🔄 ATTEMPTING LOCAL CONNECTION TO MONGODB...');
    try {
        await mongoose.connect(uri, {
            serverSelectionTimeoutMS: 5000
        });
        console.log('✅ SUCCESS: Local connection established!');
        await mongoose.disconnect();
    } catch (err) {
        console.error('❌ FAILURE: Local connection failed.');
        console.error('Error details:', err.message);
    }
}

testConnection();
