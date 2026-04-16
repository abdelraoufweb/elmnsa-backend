const mongoose = require('mongoose');
require('dotenv').config({ path: __dirname + '/.env' });
const User = require('./models/User');
const Video = require('./models/Video');

async function test() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected!');

  const students = await User.find({ role: 'student', grade: 9 }).lean();
  console.log('Grade 9 Students:', students.map(s => ({ id: s._id, name: s.firstName, grade: s.grade, curriculum: s.curriculum })));

  const videos = await Video.find({ grade: 9 }).lean();
  console.log('Grade 9 Videos:', videos.map(v => ({ id: v._id, title: v.title, grade: v.grade, curriculum: v.curriculum, status: v.status })));

  mongoose.disconnect();
}
test().catch(console.error);
