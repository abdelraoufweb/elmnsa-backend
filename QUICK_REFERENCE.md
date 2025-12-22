# ⚡ Quick Reference Card

## 🚀 Start Backend

```bash
cd backend
npm install
npm run dev
```

Server runs on: `http://localhost:5000` ✅

---

## 🔑 Authentication

### Register
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "firstName":"Ahmed",
    "lastName":"Hassan",
    "phoneNumber":"+201234567890",
    "password":"SecurePass123",
    "role":"student",
    "grade":10,
    "curriculum":"american"
  }'
```

### Login
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber":"+201234567890",
    "password":"SecurePass123"
  }'
```

Returns: `{ success: true, data: { user, token } }`

---

## 📚 Main Endpoints

### Students
- `GET /api/students/videos?curriculum=american&grade=10`
- `GET /api/students/worksheets`
- `POST /api/students/homework` (file upload)
- `GET /api/students/my-homework`
- `GET /api/students/profile`
- `PUT /api/students/profile`

### Admin
- `GET /api/admin/pending-accounts`
- `POST /api/admin/approve-account/:userId`
- `POST /api/admin/block-account/:userId`
- `POST /api/admin/announcements`
- `GET /api/admin/homework`
- `POST /api/admin/grade-homework/:id`

### Store
- `GET /api/store/products?category=books`
- `POST /api/store/orders`
- `GET /api/store/orders`
- `POST /api/store/complete-order/:orderId`

### AI
- `POST /api/ai/chat`
- `GET /api/ai/conversation/:assistantId`

---

## 🔌 Socket.IO

### Connect
```javascript
const socket = io('http://localhost:5000', {
  auth: { token: localStorage.getItem('authToken') }
});
```

### Send Chat Message
```javascript
socket.emit('message:send', {
  fromId: userId,
  toId: assistantId,
  fromName: 'Ahmed',
  fromRole: 'student',
  text: 'Hello!'
});

socket.on('message:receive', (msg) => console.log(msg));
```

### Live Class
```javascript
// Create session
socket.emit('live:create_session', {
  hostId: teacherId,
  title: 'Math Class',
  audience: 'all'
});

// Join session
socket.emit('live:join', {
  sessionCode: 'ABC123',
  userId: studentId,
  userName: 'Ahmed'
});

// Listen for participants
socket.on('live:user_joined', (data) => console.log(data));
```

### Orders
```javascript
socket.emit('order:broadcast', {
  orderId: 'ORDER123',
  buyerName: 'Ahmed',
  total: 500
});

socket.on('order:new', (order) => console.log(order));
```

---

## 🛠️ Headers for All Requests

```
Authorization: Bearer {token}
Content-Type: application/json
```

---

## 📝 File Upload

```bash
curl -X POST http://localhost:5000/api/students/homework \
  -H "Authorization: Bearer {token}" \
  -F "file=@homework.pdf" \
  -F "notes=My submission"
```

---

## ❌ Error Codes

| Code | Meaning |
|------|---------|
| `INVALID_CREDENTIALS` | Wrong password |
| `ACCOUNT_BLOCKED` | User is blocked |
| `ACCOUNT_SUSPENDED` | User is suspended |
| `TOKEN_EXPIRED` | Token expired |
| `PERMISSION_DENIED` | Insufficient permissions |
| `NOT_FOUND` | Resource not found |
| `PHONE_EXISTS` | Phone already registered |

---

## 🗂️ File Structure

```
backend/
├── index.js                    ← Main server
├── config/                     ← Configuration
├── middleware/                 ← Auth, errors, uploads
├── models/                     ← 13 Mongoose schemas
├── routes/                     ← 5 route files, 30+ endpoints
├── services/                   ← Business logic
├── utils/                      ← Helpers
└── uploads/                    ← File storage
    ├── homework/
    ├── worksheets/
    ├── profiles/
    └── materials/
```

---

## 🔑 Environment Variables

```
PORT=5000
MONGODB_URI=mongodb://localhost:27017/elmnsa
JWT_SECRET=min_32_chars_long_key
GROQ_API_KEY=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
FRONTEND_URL=http://localhost:8000
```

---

## 🧪 Health Check

```bash
curl http://localhost:5000/health
```

Response: `{ success: true, message: "Server is running" }`

---

## 📚 Key Roles & Permissions

| Role | Permissions |
|------|-------------|
| Developer | All access |
| Admin | Manage content, approve users, grade homework |
| Assistant | Help students, grade work, manage orders |
| Student | View content, upload work, chat, shop |
| Parent | View children, see grades, browse store |
| Guest | Browse store only |

---

## ✨ Special Features

### Generate Order ID
```javascript
const { generateOrderId } = require('./utils/helpers');
const orderId = generateOrderId(); // e.g., "ABC1234"
```

### Generate Session Code
```javascript
const { generateCallCode } = require('./utils/helpers');
const code = generateCallCode(); // e.g., "ABC123"
```

### Verify Access Code
```javascript
fetch('http://localhost:5000/api/auth/verify-access-code', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    code: 'ABCD1234',
    type: 'video'
  })
})
```

---

## 🚨 Common Issues

| Issue | Solution |
|-------|----------|
| MongoDB not connecting | `brew services start mongodb-community` |
| CORS error | Check FRONTEND_URL in .env |
| Port 5000 in use | Change PORT in .env |
| File upload fails | Check file size (max 50MB) |
| Socket.IO not connecting | Verify auth token |

---

## 📖 Full Documentation

- **README.md** - Setup & overview
- **API_DOCUMENTATION.md** - All endpoints
- **INTEGRATION_GUIDE.md** - Frontend code samples
- **BUILD_SUMMARY.md** - Complete build details

---

## 🎯 Next Step

Update frontend to use API endpoints instead of mock data.

See **INTEGRATION_GUIDE.md** for code examples.

---

**Backend Version:** 1.0.0
**Status:** ✅ Production Ready
