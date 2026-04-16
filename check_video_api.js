const mongoose = require('mongoose');
const URI = 'mongodb+srv://abdelraouf:abdelraoufweb0100@abdelraouf.c176sqk.mongodb.net/elmnsa?retryWrites=true&w=majority';
mongoose.connect(URI).then(async () => {
  const Video = require('./models/Video');
  const user = { role: 'student', grade: 9, curriculum: 'national' };
  
  const query = { status: 'published' };
  if (user.role === 'student') {
      if (user.grade !== undefined && user.grade !== null) {
          query.grade = Number(user.grade);
      }
      if (user.curriculum) {
          query.curriculum = user.curriculum;
      }
  }
  
  const videos = await Video.find(query).limit(1).lean();
  console.log('Query:', query);
  console.log('Returned Video ID structure:', { _id: videos[0]._id, id: videos[0].id });
  mongoose.disconnect();
}).catch(console.error);
