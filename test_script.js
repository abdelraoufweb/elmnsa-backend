require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const Theme = require('./models/Theme');

async function test() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to DB');

    // Create a dummy student
    const student = new User({
      firstName: 'Test',
      lastName: 'Student',
      phoneNumber: '9999999999',
      password: 'testpassword',
      role: 'student',
      grade: 10,
      curriculum: 'american'
    });
    await student.save();
    console.log('Student created:', student._id);

    // Test update
    student.firstName = 'Updated';
    await student.save();
    console.log('Student updated successfully');

    // Test delete
    await User.findByIdAndDelete(student._id);
    await Theme.deleteOne({ userId: student._id });
    
    const verify = await User.findById(student._id);
    if (verify) {
      console.log('Verification failed: Student still exists after deletion');
    } else {
      console.log('Student deleted successfully');
    }
    
    process.exit(0);
  } catch (err) {
    console.error('Test failed with error:', err);
    process.exit(1);
  }
}

test();
