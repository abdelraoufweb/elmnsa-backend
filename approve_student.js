
const mongoose = require('mongoose');
const User = require('./models/User');
require('dotenv').config();

const phoneArg = process.argv[2] || process.env.TARGET_PHONE;
if (!process.env.MONGODB_URI) {
    console.error('❌ MONGODB_URI is not defined. Please set it in the environment.');
    process.exit(1);
}

if (!phoneArg) {
    console.error('❌ Phone number argument is required. Usage: node approve_student.js <phoneNumber>');
    process.exit(1);
}

const phoneNumber = String(phoneArg).trim();
if (!/^[0-9+\-() ]{6,20}$/.test(phoneNumber)) {
    console.error('❌ Invalid phone number format');
    process.exit(1);
}

const run = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
        console.log('Connected to MongoDB');

        const res = await User.updateOne(
            { phoneNumber },
            { $set: { status: 'approved' } }
        );

        console.log('Update result:', res);
        if (!res.matchedCount && !res.n) {
            console.error('❌ No matching user found for phone number:', phoneNumber);
            await mongoose.disconnect();
            process.exit(2);
        }

        if ((res.modifiedCount || res.nModified) === 0) {
            console.warn('⚠️ User matched but no modification was made (already approved?)');
        }

        await mongoose.disconnect();
        process.exit(0);
    } catch (err) {
        console.error('❌ Error:', err.message || err);
        try { await mongoose.disconnect(); } catch (e) {}
        process.exit(1);
    }
};

run();
