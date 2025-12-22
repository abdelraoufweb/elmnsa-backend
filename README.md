# 🎓 Elmnsa Educational Platform - Backend

Production-grade Node.js + Express backend for comprehensive educational management system.

## 🚀 Features

✅ **JWT Authentication** - Secure token-based authentication with role-based access control
✅ **MongoDB Integration** - Mongoose ODM for data persistence
✅ **Socket.IO Real-Time** - Live chat, notifications, orders, and live classes
✅ **Groq AI Integration** - Educational AI assistant for student support
✅ **File Management** - Local storage for homework, worksheets, and profile images
✅ **WebRTC Signaling** - Live class support with screen sharing
✅ **Security Logging** - Comprehensive audit trail for admin actions
✅ **Account Management** - Block/suspend/reject functionality with reasons
✅ **Order System** - Unique order ID generation and status tracking
✅ **Error Handling** - Comprehensive error handling and validation

---

## 📋 Prerequisites

- **Node.js** v14+ (v16+ recommended)
- **MongoDB** (local or MongoDB Atlas)
- **npm** or **yarn**
- **Groq API Key** (provided: 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)

---

## 🔧 Installation

### 1. Navigate to Backend Directory
```bash
cd backend
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment
```bash
# Create .env file with your configuration
cp .env .env.local  # or edit the existing .env file
```

Edit `.env` and update these critical values:

```env
# Server
PORT=5000
NODE_ENV=development
SERVER_URL=http://localhost:5000
FRONTEND_URL=http://localhost:8000

# Database
MONGODB_URI=mongodb://localhost:27017/elmnsa
# For MongoDB Atlas: mongodb+srv://user:pass@cluster.mongodb.net/elmnsa

# JWT
JWT_SECRET=your_super_secret_key_min_32_chars_long_change_this
JWT_EXPIRE=7d

# AI (Groq)
GROQ_API_KEY=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
GROQ_MODEL=mixtral-8x7b-32768

# File Upload
MAX_FILE_SIZE=52428800
UPLOAD_DIR=./uploads

# Admin Codes
DEVELOPER_CODE=rashwan20081907
ADMIN_CODE=ahmed/assem/@24681012
```

### 4. Start Development Server
```bash
npm run dev
```

You should see:
```
✅ MongoDB Connected
✅ Server Running on Port: 5000
✅ Socket.IO: Enabled
```

### 5. Verify Backend is Running
```bash
curl http://localhost:5000/health
```

Expected response:
```json
{
  "success": true,
  "message": "Server is running",
  "environment": "development"
}
```

---

## 📁 Project Structure

```
backend/
├── config/
│   ├── database.js          # MongoDB connection
│   └── constants.js         # App-wide constants
├── middleware/
│   ├── auth.js              # JWT & authorization
│   ├── errorHandler.js      # Error handling
│   └── fileUpload.js        # Multer configuration
├── models/                  # Mongoose schemas
│   ├── User.js
│   ├── Video.js
│   ├── Worksheet.js
│   ├── Homework.js
│   ├── Message.js
│   ├── Order.js
│   ├── Product.js
│   ├── Schedule.js
│   ├── Announcement.js
│   ├── AccessCode.js
│   ├── LiveSession.js
│   ├── SecurityLog.js
│   └── Notification.js
├── routes/                  # API endpoints
│   ├── auth.js              # Authentication
│   ├── students.js          # Student endpoints
│   ├── admin.js             # Admin endpoints
│   └── store.js             # Store/orders
├── services/                # Business logic
│   ├── authService.js       # Auth logic
│   ├── aiService.js         # Groq AI integration
│   └── socketManager.js     # Socket.IO handlers
├── utils/
│   ├── helpers.js           # Utility functions
│   └── jwt.js               # JWT utilities
├── uploads/                 # File storage
│   ├── homework/
│   ├── worksheets/
│   ├── profiles/
│   └── materials/
├── index.js                 # Main server file
├── package.json
├── .env                     # Configuration
├── API_DOCUMENTATION.md     # API docs
└── INTEGRATION_GUIDE.md     # Frontend guide
```

---

## 🔑 API Overview

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/verify-access-code` - Unlock video/AI access
- `GET /api/auth/me` - Get current user
- `POST /api/auth/logout` - Logout

### Students
- `GET /api/students/videos` - Get videos
- `GET /api/students/worksheets` - Get worksheets
- `POST /api/students/homework` - Upload homework
- `GET /api/students/my-homework` - Get submissions
- `GET /api/students/profile` - Get profile
- `PUT /api/students/profile` - Update profile

### Admin
- `GET /api/admin/pending-accounts` - Pending approvals
- `POST /api/admin/approve-account/:userId`
- `POST /api/admin/reject-account/:userId`
- `POST /api/admin/block-account/:userId`
- `POST /api/admin/unblock-account/:userId`
- `POST /api/admin/suspend-account/:userId`
- `GET /api/admin/homework` - All homework
- `POST /api/admin/grade-homework/:id`
- `GET /api/admin/security-logs`

### Store
- `GET /api/store/products` - Browse products
- `POST /api/store/orders` - Create order
- `GET /api/store/orders` - My orders
- `GET /api/store/all-orders` - All orders (admin)
- `POST /api/store/complete-order/:orderId`

### Real-Time (Socket.IO)
- `message:send` - Send chat message
- `typing:start/stop` - Typing indicators
- `live:create_session` - Start live class
- `live:join/leave` - Join/leave class
- `live:screen_share` - Start screen share
- `notification:send` - Send notification
- `order:broadcast` - Broadcast new order

---

## 📊 Database Models

### User
All user types (student, parent, admin, assistant, developer) share the User model with role-based fields.

### Video
Educational videos with YouTube integration and access control.

### Homework
Student submissions with grading system.

### Order
Store orders with auto-generated Order IDs.

### Message
Real-time chat between students and assistants.

### LiveSession
WebRTC signaling and participant tracking.

---

## 🔐 Security

- **JWT Tokens** - Secure stateless authentication
- **Password Hashing** - Bcrypt encryption
- **Role-Based Access Control** - Permission system
- **Security Logging** - Audit trail for actions
- **Account Protection** - Block/suspend capabilities
- **CORS Protection** - Origin validation
- **File Validation** - Type and size checks

---

## 🌐 Environment Variables Explained

| Variable | Purpose | Example |
|----------|---------|---------|
| `PORT` | Server port | 5000 |
| `NODE_ENV` | Environment | development, production |
| `MONGODB_URI` | Database URL | mongodb://localhost:27017/elmnsa |
| `JWT_SECRET` | Token signing key | min 32 chars |
| `GROQ_API_KEY` | AI API key | gsk_... |
| `FRONTEND_URL` | Frontend origin | http://localhost:8000 |

---

## 💾 MongoDB Setup

### Option 1: Local MongoDB
```bash
# Install MongoDB (macOS)
brew tap mongodb/brew
brew install mongodb-community

# Start MongoDB
brew services start mongodb-community

# Verify connection
mongosh
```

### Option 2: MongoDB Atlas (Cloud)
1. Create account at https://www.mongodb.com/cloud/atlas
2. Create a cluster
3. Get connection string
4. Update `.env` with connection string

---

## 🚀 Development Commands

```bash
# Start with nodemon (auto-reload)
npm run dev

# Start production
npm start

# Run tests
npm test
```

---

## 📝 Example Requests

### Register
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Ahmed",
    "lastName": "Hassan",
    "phoneNumber": "+201234567890",
    "password": "SecurePass123",
    "role": "student",
    "grade": 10,
    "curriculum": "american"
  }'
```

### Login
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "+201234567890",
    "password": "SecurePass123"
  }'
```

### Get Videos
```bash
curl -X GET http://localhost:5000/api/students/videos \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## 🔌 Socket.IO Connection

```javascript
import io from 'socket.io-client';

const socket = io('http://localhost:5000', {
  auth: { token: localStorage.getItem('authToken') }
});

socket.on('connect', () => {
  console.log('✅ Connected');
  socket.emit('user:online', userId);
});
```

---

## ❌ Common Issues & Solutions

### MongoDB Connection Failed
```
Solution: 
1. Ensure MongoDB is running: brew services start mongodb-community
2. Check connection string in .env
3. For Atlas: Add IP to whitelist
```

### CORS Error
```
Solution:
1. Check FRONTEND_URL in .env matches your frontend
2. Verify frontend is on the correct port
```

### Port Already in Use
```bash
# Kill process on port 5000
lsof -ti:5000 | xargs kill -9

# Or change PORT in .env
```

### Token Expired
```
Solution:
1. Clear localStorage and re-login
2. Check JWT_EXPIRE value
3. Ensure clock sync on server/client
```

### File Upload Not Working
```
Solution:
1. Ensure /uploads directory exists
2. Check MAX_FILE_SIZE in .env
3. Verify file type is allowed
```

---

## 📚 Documentation

- **API_DOCUMENTATION.md** - Complete API reference
- **INTEGRATION_GUIDE.md** - Frontend integration examples
- **package.json** - Dependencies and scripts

---

## 🧪 Testing

### Health Check
```bash
curl http://localhost:5000/health
```

### Test Socket.IO
```bash
# Use browser console
const socket = io('http://localhost:5000');
socket.on('connect', () => console.log('✅ Connected'));
```

### Test API with Postman
- Import endpoints from API_DOCUMENTATION.md
- Set Authorization header: `Bearer YOUR_TOKEN`
- Test CRUD operations

---

## 📈 Performance Tips

- Enable database indexing (already in models)
- Use pagination for large datasets
- Cache frequently accessed data
- Implement rate limiting in production
- Use CDN for static files
- Monitor with APM tools

---

## 🔄 Deployment Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Use HTTPS
- [ ] Configure MongoDB Atlas
- [ ] Set strong JWT_SECRET
- [ ] Whitelist FRONTEND_URL
- [ ] Enable rate limiting
- [ ] Set up logging/monitoring
- [ ] Configure backups
- [ ] Test all endpoints
- [ ] Verify file uploads work

---

## 📞 Support & Contribution

For issues, questions, or contributions, please reach out to the development team.

---

## 📄 License

MIT License

---

## 👨‍💻 Author

**Ikramy Eltayeb**

Backend Version: **1.0.0**  
Last Updated: **2024**

---

## 🎯 Next Steps

1. ✅ Backend is ready
2. ⏭️ Update frontend to use API endpoints
3. ⏭️ Test all flows end-to-end
4. ⏭️ Deploy to production
5. ⏭️ Monitor and optimize

**Happy Coding! 🚀**
