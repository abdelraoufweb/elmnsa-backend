require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

const checkAssistants = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const count = await User.countDocuments({ role: 'assistant' });
        const assistants = await User.find({ role: 'assistant' }).select('firstName lastName email');

        console.log(`\n=================`);
        console.log(`TOTAL ASSISTANTS: ${count}`);
        console.log(`=================\n`);

        if (count > 0) {
            assistants.forEach((a, i) => {
                console.log(`${i + 1}. ${a.firstName} ${a.lastName} (${a.email})`);
            });
        }

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
};

checkAssistants();
