const mongoose = require('mongoose');
const User = require('./models/User');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const uri = process.env.MONGODB_URI;
console.log('Connecting to DB...');

mongoose.connect(uri)
    .then(async () => {
        console.log('Connected to DB');

        // 1. Find an approved user
        const user = await User.findOne({ status: 'approved', role: 'student' });
        if (!user) {
            console.log('No approved student found to test suspension with.');
            process.exit(0);
        }
        console.log(`Found user to test: ${user.firstName} ${user.lastName} (${user._id})`);

        // 2. Determine if getAllStudents query finds them normally
        let query = { role: 'student', status: { $ne: 'rejected' } };
        let found = await User.findOne({ _id: user._id, ...query });
        console.log(`User found by getAllStudents query (when approved)? ${!!found}`);

        // 3. Suspend the user manually
        const originalStatus = user.status;
        user.status = 'suspended';
        user.suspensionReason = 'Test Suspension';
        user.suspendedAt = new Date();
        await user.save();
        console.log('User status changed to suspended.');

        // 4. Check if getAllStudents query finds them NOW
        found = await User.findOne({ _id: user._id, ...query });
        console.log(`User found by getAllStudents query (when suspended)? ${!!found}`);

        if (found) {
            console.log('✅ Backend Query logic accepts suspended users.');
        } else {
            console.log('❌ Backend Query logic EXCLUDES suspended users!');
        }

        // 5. Revert
        user.status = originalStatus;
        await user.save();
        console.log('User status reverted.');

        process.exit(0);
    })
    .catch(err => {
        console.error('Error:', err);
        process.exit(1);
    });
