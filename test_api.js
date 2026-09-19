const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const Exam = require('./models/Exam');
const Question = require('./models/Question');

async function test() {
  await mongoose.connect(process.env.MONGO_URI);
  try {
    const questions = await Question.find({ examId: '6a7dd28d446da5f9a4facb04' }).sort('moduleNumber order').lean();
    console.log('Success:', questions.length);
  } catch (err) {
    console.error('Error:', err);
  }
  process.exit();
}
test();
