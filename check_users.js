
const mongoose = require('mongoose');
const User = require('./models/User');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI)
    .then(async () => {
        console.log('Connected to MongoDB');

        const admins = await User.find({ role: { $in: ['admin', 'assistant', 'developer'] } });
        console.log(`Found ${admins.length} support users:`);
        admins.forEach(u => console.log(`- ${u.firstName} ${u.lastName} [${u.role}] ID: ${u._id}`));

        if (admins.length === 0) {
            console.log('No admin users found. Creating default admin via atomic upsert...');
            const bcrypt = require('bcryptjs');
            const crypto = require('node:crypto');

            const defaultPassword = process.env.DEFAULT_ADMIN_PASSWORD || crypto.randomBytes(12).toString('base64');
            const saltRounds = 10;
            const hashedPassword = await bcrypt.hash(defaultPassword, saltRounds);

            const phoneNumber = process.env.DEFAULT_ADMIN_PHONE || '00000000000';

            const result = await User.findOneAndUpdate(
                { role: 'admin' },
                {
                    $setOnInsert: {
                        firstName: 'System',
                        lastName: 'Admin',
                        role: 'admin',
                        phoneNumber: phoneNumber,
                        password: hashedPassword,
                        status: 'approved'
                    }
                },
                { upsert: true, new: true, setDefaultsOnInsert: true }
            );

            console.log(`Admin user ensured with ID: ${result._id}`);
            if (!process.env.DEFAULT_ADMIN_PASSWORD) {
                // Print generated password once to stdout so operator can rotate it; avoid persistent logging
                console.log('One-time generated admin password (rotate on first login):');
                console.log(defaultPassword);
            }
        }

        process.exit(0);
    })
    .catch(err => {
        console.error(err);
        process.exit(1);
    });
