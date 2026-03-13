require('dotenv').config();
const mongoose = require('mongoose');
const AccessCode = require('./models/AccessCode');

const checkAssistantCodes = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const codes = await AccessCode.find({
            $or: [
                { role: 'assistant' },
                { type: 'assistant' }
            ]
        }).lean();

        console.log(`\n=================`);
        console.log(`TOTAL ASSISTANT ACCESS CODES: ${codes.length}`);
        console.log(`=================\n`);

        if (codes.length > 0) {
            codes.forEach((c, i) => {
                console.log(`${i + 1}. Code: "${c.code}" | Role: ${c.role} | Active: ${c.active} | Usage: ${c.currentUsers}/${c.maxUsers || 'unlimited'}`);
            });
        }

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
};

checkAssistantCodes();
