const mongoose = require('mongoose');
const URI = 'mongodb+srv://abdelraouf:abdelraoufweb0100@abdelraouf.c176sqk.mongodb.net/elmnsa?retryWrites=true&w=majority';
mongoose.connect(URI).then(async () => {
    const Video = require('./models/Video');
    const videos = await Video.find({}).lean();
    console.log('Video count:', videos.length);
    console.log('Type of id in API response expected: string');
    console.log('Sample video id:', videos[0]._id.toString());
    mongoose.disconnect();
}).catch(console.error);
