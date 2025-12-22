# Elmnsa Backend - API Documentation

## Overview
Production-grade Node.js + Express backend for the Elmnsa educational platform. Features JWT authentication, MongoDB integration, Socket.IO real-time communication, and Groq AI integration.

## Setup Instructions

### 1. Install Dependencies
```bash
cd backend
npm install
```

### 2. Configure Environment
Copy `.env` template and update values:
```bash
cp .env.template .env
```

Edit `.env` and update:
- `MONGODB_URI`: Your MongoDB connection string
- `JWT_SECRET`: Secure JWT key (min 32 characters)
- `GROQ_API_KEY`: Your Groq API key (already provided)
- `FRONTEND_URL`: Your frontend URL
- `PORT`: Server port (default: 5000)

### 3. Start Server
```bash
# Development (with nodemon)
npm run dev

# Production
npm start
```

---

## Authentication API

### Register User
**POST** `/api/auth/register`

```json
{
  "firstName": "Ahmed",
  "middleName": "Mohamed",
  "lastName": "Hassan",
  "phoneNumber": "+201234567890",
  "password": "SecurePass123",
  "role": "student",
  "grade": 10,
  "curriculum": "american",
  "parentPhone": "+201234567891",
  "schoolName": "Cairo International"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Registration successful",
  "data": {
    "user": { /* user object */ },
    "token": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

### Login User
**POST** `/api/auth/login`

```json
{
  "phoneNumber": "+201234567890",
  "password": "SecurePass123"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": { /* user object */ },
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "canAccessVideos": true,
    "canAccessAI": false,
    "accountStatus": "approved"
  }
}
```

### Verify Access Code
**POST** `/api/auth/verify-access-code`

Headers: `Authorization: Bearer {token}`

```json
{
  "code": "ABCD1234",
  "type": "video"
}
```

**Types:** `video`, `ai`

### Get Current User
**GET** `/api/auth/me`

Headers: `Authorization: Bearer {token}`

### Logout
**POST** `/api/auth/logout`

Headers: `Authorization: Bearer {token}`

---

## Student API

### Get Videos
**GET** `/api/students/videos?curriculum=american&grade=10`

Headers: `Authorization: Bearer {token}`

### Get Worksheets
**GET** `/api/students/worksheets?curriculum=american&grade=10`

### Upload Homework
**POST** `/api/students/homework`

Headers: `Authorization: Bearer {token}`, `Content-Type: multipart/form-data`

```
- file: [PDF/DOC file]
- notes: "My homework submission"
```

### Get My Homework
**GET** `/api/students/my-homework`

Headers: `Authorization: Bearer {token}`

### Get Student Profile
**GET** `/api/students/profile`

Headers: `Authorization: Bearer {token}`

### Update Student Profile
**PUT** `/api/students/profile`

Headers: `Authorization: Bearer {token}`

```json
{
  "firstName": "Ahmed",
  "lastName": "Hassan",
  "parentPhone": "+201234567891",
  "schoolName": "Cairo International",
  "photoURL": "https://..."
}
```

### Get Chat History
**GET** `/api/students/chat/:assistantId`

Headers: `Authorization: Bearer {token}`

---

## Admin API

### Get Pending Accounts
**GET** `/api/admin/pending-accounts`

Headers: `Authorization: Bearer {token}` (admin/developer only)

### Approve Account
**POST** `/api/admin/approve-account/:userId`

### Reject Account
**POST** `/api/admin/reject-account/:userId`

```json
{
  "reason": "Invalid school credentials"
}
```

### Block Account
**POST** `/api/admin/block-account/:userId`

```json
{
  "reason": "Inappropriate behavior"
}
```

### Unblock Account
**POST** `/api/admin/unblock-account/:userId`

### Suspend Account
**POST** `/api/admin/suspend-account/:userId`

```json
{
  "reason": "Temporary suspension for review"
}
```

### Send Announcement
**POST** `/api/admin/announcements`

```json
{
  "title": "Important Update",
  "message": "Please update your profile information",
  "target": "all",
  "priority": "high"
}
```

**Targets:** `all`, `parents`, `american`, `national`, `grade9`, `grade10`, etc.

### Get All Homework
**GET** `/api/admin/homework?status=pending`

### Grade Homework
**POST** `/api/admin/grade-homework/:homeworkId`

```json
{
  "grade": "A",
  "feedback": "Excellent work! Well done."
}
```

### Get Security Logs
**GET** `/api/admin/security-logs?type=login&severity=warning&limit=50`

(Developer only)

---

## Store API

### Get Products
**GET** `/api/store/products?category=books`

**Categories:** `books`, `worksheets`, `tools`, `subscriptions`

No authentication required for browsing.

### Get Product Details
**GET** `/api/store/products/:id`

### Create Order
**POST** `/api/store/orders`

Headers: `Authorization: Bearer {token}`

```json
{
  "items": [
    {
      "productId": "507f1f77bcf86cd799439011",
      "quantity": 1
    }
  ],
  "buyerPhone": "+201234567890",
  "buyerEmail": "student@example.com",
  "buyerAddress": "123 Cairo Street"
}
```

**Response:** Includes auto-generated `orderId`

### Get My Orders
**GET** `/api/store/orders`

Headers: `Authorization: Bearer {token}`

### Get Order Details
**GET** `/api/store/orders/:orderId`

### Get All Orders (Admin/Assistant)
**GET** `/api/store/all-orders?status=pending`

### Complete Order (Admin/Assistant)
**POST** `/api/store/complete-order/:orderId`

```json
{
  "notes": "Order ready for pickup"
}
```

---

## Socket.IO Real-Time Events

### Connection
```javascript
const socket = io('http://localhost:5000', {
  auth: {
    token: 'your-jwt-token'
  }
});
```

### User Presence
```javascript
// User comes online
socket.emit('user:online', userId);

// User goes offline
socket.emit('user:offline', userId);

// Listen for status changes
socket.on('user:status_changed', (data) => {
  console.log(data.userId, data.status);
});
```

### Chat Messages
```javascript
// Send message
socket.emit('message:send', {
  fromId: 'user1-id',
  toId: 'user2-id',
  fromName: 'Ahmed',
  fromRole: 'student',
  text: 'Hello!',
  threadId: 'optional-thread-id'
});

// Receive message
socket.on('message:receive', (message) => {
  console.log('New message:', message);
});

// Mark as read
socket.emit('message:read', {
  messageId: 'msg-id',
  toId: 'sender-id'
});

// Typing indicators
socket.emit('typing:start', { fromId, toId, fromName });
socket.on('typing:indicator', (data) => { /* ... */ });

socket.emit('typing:stop', { fromId, toId });
socket.on('typing:stop', (data) => { /* ... */ });
```

### Notifications
```javascript
// Subscribe to notifications
socket.emit('notification:subscribe', userId);

// Receive notifications
socket.on('notification:new', (notification) => {
  console.log('New notification:', notification);
});

// Send notification
socket.emit('notification:send', {
  recipientId: 'user-id',
  title: 'New Assignment',
  message: 'Check your homework',
  type: 'homework',
  refId: 'homework-id'
});

// Unsubscribe
socket.emit('notification:unsubscribe', userId);
```

### Live Class/Call
```javascript
// Create session
socket.emit('live:create_session', {
  hostId: 'teacher-id',
  title: 'Algebra Class',
  audience: 'all'
});

// Join session
socket.emit('live:join', {
  sessionCode: 'ABC123',
  userId: 'user-id',
  userName: 'Ahmed',
  userRole: 'student'
});

// Listen for participants
socket.on('live:user_joined', (data) => {
  console.log(data.userName, 'joined');
});

// Screen share
socket.emit('live:screen_share', {
  sessionCode: 'ABC123',
  userId: 'user-id'
});

socket.on('live:screen_shared', (data) => {
  console.log(data.userId, 'is sharing screen');
});

// Leave session
socket.emit('live:leave', {
  sessionCode: 'ABC123',
  userId: 'user-id'
});

socket.on('live:user_left', (data) => {
  console.log('User left. Remaining:', data.totalParticipants);
});
```

### WebRTC Signaling
```javascript
// Send offer
socket.emit('webrtc:offer', {
  to: 'remote-user-id',
  offer: rtcOffer,
  sessionCode: 'ABC123'
});

socket.on('webrtc:offer', (data) => {
  // Handle incoming offer
});

// Send answer
socket.emit('webrtc:answer', {
  to: 'remote-user-id',
  answer: rtcAnswer,
  sessionCode: 'ABC123'
});

socket.on('webrtc:answer', (data) => {
  // Handle incoming answer
});

// Send ICE candidates
socket.emit('webrtc:ice_candidate', {
  to: 'remote-user-id',
  candidate: iceCandidate
});

socket.on('webrtc:ice_candidate', (data) => {
  // Handle incoming ICE candidate
});
```

### Orders
```javascript
// Broadcast new order
socket.emit('order:broadcast', {
  orderId: 'ORDER123',
  buyerName: 'Ahmed',
  items: [...],
  total: 500
});

socket.on('order:new', (order) => {
  console.log('New order:', order);
});

// Update order status
socket.emit('order:status_update', {
  orderId: 'ORDER123',
  status: 'completed'
});

socket.on('order:status_changed', (data) => {
  console.log('Order status:', data.status);
});
```

---

## Error Responses

### 400 Bad Request
```json
{
  "success": false,
  "message": "Missing required fields",
  "error": "MISSING_FIELDS"
}
```

### 401 Unauthorized
```json
{
  "success": false,
  "message": "Invalid token",
  "error": "INVALID_TOKEN"
}
```

### 403 Forbidden
```json
{
  "success": false,
  "message": "Account blocked",
  "error": "ACCOUNT_BLOCKED",
  "reason": "Inappropriate behavior"
}
```

### 404 Not Found
```json
{
  "success": false,
  "message": "User not found",
  "error": "NOT_FOUND"
}
```

### 409 Conflict
```json
{
  "success": false,
  "message": "Phone number already registered",
  "error": "PHONE_EXISTS"
}
```

---

## Data Models

### User
```
{
  firstName, middleName, lastName,
  phoneNumber (unique),
  password (hashed),
  role: developer|admin|assistant|student|parent|guest,
  status: pending|approved|blocked|suspended|rejected,
  grade (9-12), curriculum,
  parentPhone, schoolName,
  photoURL,
  videoAccessUnlocked, videoAccessCode,
  aiAccessUnlocked, aiAccessCode,
  approvedAt, blockedAt, suspendedAt,
  lastLoginAt, isOnline,
  createdAt, updatedAt
}
```

### Video
```
{
  title, description,
  youtubeUrl, youtubeId,
  curriculum, grade,
  accessCode, isPublic,
  maxViewsPerUser, expiryDate,
  views, ratings,
  createdBy, createdAt
}
```

### Homework
```
{
  studentId, studentName, studentGrade,
  fileName, fileSize, fileType, fileUrl,
  notes, status: pending|graded,
  grade, feedback,
  gradedBy, submittedAt, gradedAt,
  createdAt
}
```

### Order
```
{
  orderId (auto-generated),
  buyerId, buyerName, buyerPhone,
  items: [{ productId, quantity, price }],
  total, currency,
  status: pending|completed|cancelled,
  completedAt, completedBy,
  createdAt
}
```

---

## Security Features

✅ **JWT Authentication** - Secure token-based auth
✅ **Password Hashing** - BCrypt encryption
✅ **Role-Based Access Control** - Permissions by role
✅ **Security Logging** - All important actions logged
✅ **Account Protection** - Block/suspend capabilities
✅ **CORS Protection** - Origin validation
✅ **Helmet Security** - HTTP headers protection
✅ **File Upload Validation** - Type & size checks

---

## Rate Limiting

- **Guest:** 10 requests per 15 minutes
- **Student:** 100 requests per 15 minutes
- **Assistant:** 200 requests per 15 minutes
- **Admin/Developer:** Unlimited

---

## Support

For issues or questions, contact the development team.

**Backend Version:** 1.0.0
**Last Updated:** 2024
