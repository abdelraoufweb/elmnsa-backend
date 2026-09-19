const mongoose = require('mongoose');
const URI = 'mongodb+srv://abdelraouf:abdelraoufweb0100@abdelraouf.c176sqk.mongodb.net/elmnsa?retryWrites=true&w=majority';
mongoose.connect(URI).then(async () => {
  const Video = require('./models/Video');
  const videos = await Video.find({}).select('title grade curriculum isPublic _id');
  console.log('VIDEOS FROM DB:', JSON.stringify(videos, null, 2));
  mongoose.disconnect();
}).catch(console.error);
