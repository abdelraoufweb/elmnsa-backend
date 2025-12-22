# Complete Data Models Documentation

## 📊 Database Schema Overview

All models use MongoDB with Mongoose ODM. Each model includes validation, indexes, and relationships.

---

## 👤 User Model

**File:** `/backend/models/User.js`

### Schema
```javascript
{
  _id: ObjectId,
  
  // Personal Information
  firstName: String (required),
  lastName: String (required),
  middleName: String (optional),
  
  // Contact
  phoneNumber: String (required, unique),
  email: String (optional, unique),
  parentPhone: String (optional),
  
  // Credentials
  password: String (required, hashed with SHA256),
  
  // Role & Status
  role: Enum ['student', 'admin', 'assistant', 'developer', 'parent', 'teacher'],
  status: Enum ['pending', 'approved', 'blocked'],
  
  // Student Information
  grade: Number (9-12),
  curriculum: Enum ['american', 'national'],
  schoolName: String (optional),
  
  // Account Management
  accessCodes: [String],  // Codes user has used
  themeName: String (default: 'theme-dark'),
  lastLoginAt: Date,
  blockedReason: String (optional),
  
  // Timestamps
  registeredAt: Date (default: now),
  approvedAt: Date (optional),
  approvedBy: ObjectId (ref: User),
  updatedAt: Date (default: now)
}
```

### Indexes
```javascript
// Unique indexes
{ phoneNumber: 1 }  // Phone must be unique
{ email: 1 }        // Email unique (sparse)

// Regular indexes
{ role: 1 }
{ status: 1 }
{ grade: 1 }
{ curriculum: 1 }
{ registeredAt: -1 }
{ lastLoginAt: -1 }
```

### Methods
```javascript
// Hash password
user.setPassword(plainPassword)  // Auto hashes on save

// Check password
user.checkPassword(plainPassword)  // Returns boolean

// Get public profile
user.toPublicJSON()  // Excludes password, returns safe data
```

### Example Document
```json
{
  "_id": "507f1f77bcf86cd799439011",
  "firstName": "Ahmed",
  "lastName": "Rashwan",
  "phoneNumber": "201001234567",
  "role": "student",
  "status": "approved",
  "grade": 10,
  "curriculum": "american",
  "schoolName": "Cairo High School",
  "themeName": "theme-ocean",
  "lastLoginAt": "2025-12-20T15:30:00Z",
  "registeredAt": "2025-12-20T10:00:00Z",
  "approvedAt": "2025-12-21T10:00:00Z",
  "approvedBy": "507f1f77bcf86cd799439012",
  "updatedAt": "2025-12-20T15:30:00Z"
}
```

---

## 🎬 Video Model

**File:** `/backend/models/Video.js`

### Schema
```javascript
{
  _id: ObjectId,
  
  // Basic Information
  title: String (required),
  description: String (optional),
  
  // Media Sources (at least one required)
  youtubeUrl: String (optional),
  youtubeId: String (auto-extracted),
  mp4Url: String (optional, data URL or file path),
  mp4Path: String (optional, file system path),
  
  // Video Quality Options
  supportedQualities: [String] (default: ['720p']),
  // Example: ['360p', '480p', '720p', '1080p']
  defaultQuality: String (default: '720p'),
  
  // Curriculum Information
  curriculum: Enum ['american', 'national'] (required),
  grade: Number (required, 9-12),
  
  // Access Control
  needsAccessCodes: Boolean (default: false),
  accessCodes: [ObjectId] (ref: AccessCode),
  
  // Metadata
  duration: Number (seconds),
  thumbnail: String (URL),
  views: Number (default: 0),
  
  // Audit Information
  createdBy: ObjectId (ref: User, required),
  createdByRole: Enum ['admin', 'assistant', 'developer'],
  approvedBy: ObjectId (ref: User, optional),
  
  // Status
  status: Enum ['draft', 'published', 'archived'],
  
  // Timestamps
  createdAt: Date (default: now),
  updatedAt: Date (default: now),
  publishedAt: Date (optional)
}
```

### Pre-save Validation
```javascript
// Must have at least YouTube URL or MP4 URL
if (!youtubeUrl && !mp4Url) {
  throw Error('Either youtubeUrl or mp4Url must be provided')
}

// Extract YouTube ID if URL provided
if (youtubeUrl) {
  const youtubeRegex = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/;
  const match = youtubeUrl.match(youtubeRegex);
  if (match) this.youtubeId = match[1];
}
```

### Indexes
```javascript
{ curriculum: 1, grade: 1 }  // Most common query
{ createdBy: 1, createdAt: -1 }
{ status: 1 }
{ createdAt: -1 }
```

### Example Document
```json
{
  "_id": "507f1f77bcf86cd799439013",
  "title": "Physics Basics - Motion",
  "description": "Introduction to physics and motion concepts",
  "youtubeUrl": "https://youtube.com/watch?v=dQw4w9WgXcQ",
  "youtubeId": "dQw4w9WgXcQ",
  "mp4Url": "https://storage.example.com/videos/physics-basics-720p.mp4",
  "mp4Path": "uploads/videos/720p/physics-basics.mp4",
  "supportedQualities": ["720p", "1080p"],
  "defaultQuality": "720p",
  "curriculum": "american",
  "grade": 10,
  "needsAccessCodes": false,
  "duration": 3600,
  "views": 250,
  "createdBy": "507f1f77bcf86cd799439011",
  "createdByRole": "admin",
  "status": "published",
  "createdAt": "2025-12-20T10:00:00Z",
  "publishedAt": "2025-12-20T12:00:00Z",
  "updatedAt": "2025-12-20T15:30:00Z"
}
```

---

## 🔑 AccessCode Model

**File:** `/backend/models/AccessCode.js`

### Schema
```javascript
{
  _id: ObjectId,
  
  // Code Information
  code: String (required, unique),
  // IMPORTANT: trim: false, uppercase: false
  // Codes must match EXACTLY (case-sensitive, no spaces)
  
  // Code Type
  type: Enum [
    'developer',  // For developer access
    'student',    // For student registration
    'admin',      // For admin access
    'assistant',  // For assistant access
    'video',      // For unlocking specific videos
    'ai',         // For AI chat access
    'otp'         // One-time password
  ],
  
  // Usage Limits
  maxUsers: Number (default: null, unlimited),
  currentUsers: Number (default: 0),
  usageByUser: Map<UserId, Number> (tracks per-user usage),
  maxViewsPerUser: Number (default: null, unlimited),
  
  // Validity
  active: Boolean (default: true),
  expiryDate: Date (optional, null = never expires),
  createdAt: Date (default: now),
  
  // Relations
  createdBy: ObjectId (ref: User),
  linkedResource: ObjectId (optional, ref: Video),
  
  // Usage Tracking
  usageLog: [{
    userId: ObjectId,
    usedAt: Date,
    ipAddress: String
  }]
}
```

### Validation Rules
```javascript
// Code must be exact match (NO trim, NO uppercase conversion)
// Example: "DEV123" !== "dev123" and "ABC" !== "ABC "

// Expiry validation
if (expiryDate && expiryDate < now) {
  code is expired
}

// User limit validation
if (maxUsers && currentUsers >= maxUsers) {
  code at capacity
}

// Per-user view limit
if (maxViewsPerUser && usageByUser[userId] >= maxViewsPerUser) {
  user has reached limit
}
```

### Indexes
```javascript
{ code: 1 }           // Unique lookup
{ type: 1 }
{ expiryDate: 1 }     // For finding expired codes
{ createdBy: 1 }
```

### Example Document
```json
{
  "_id": "507f1f77bcf86cd799439014",
  "code": "DEV123456789ABC",
  "type": "developer",
  "maxUsers": 100,
  "currentUsers": 35,
  "maxViewsPerUser": null,
  "active": true,
  "expiryDate": "2026-01-20T00:00:00Z",
  "createdBy": "507f1f77bcf86cd799439012",
  "linkedResource": null,
  "usageLog": [
    {
      "userId": "507f1f77bcf86cd799439011",
      "usedAt": "2025-12-20T10:30:00Z",
      "ipAddress": "192.168.1.1"
    }
  ],
  "usageByUser": {
    "507f1f77bcf86cd799439011": 1
  },
  "createdAt": "2025-12-15T08:00:00Z"
}
```

---

## 💬 Message Model

**File:** `/backend/models/Message.js`

### Schema
```javascript
{
  _id: ObjectId,
  
  // Message Content
  text: String (required),
  type: Enum ['text', 'file', 'image'] (default: 'text'),
  
  // Sender Information
  from: Enum ['student', 'assistant', 'admin', 'developer', 'teacher', 'parent'],
  fromId: ObjectId (ref: User, required),
  fromName: String,
  
  // Recipient Information
  toId: ObjectId (ref: User, required),
  toRole: String,
  
  // Thread Information
  threadId: String (format: "chat:<userId>"),
  parentMessageId: ObjectId (optional, for replies),
  
  // Status
  status: Enum ['sent', 'delivered', 'read', 'failed'],
  read: Boolean (default: false),
  readAt: Date (optional),
  
  // Attachments
  attachment: {
    type: String,
    url: String,
    size: Number
  },
  
  // Timestamps
  createdAt: Date (default: now),
  updatedAt: Date (default: now)
}
```

### Indexes
```javascript
{ threadId: 1, createdAt: -1 }  // Most common query
{ fromId: 1, createdAt: -1 }
{ toId: 1, status: 1 }
{ read: 1, toId: 1 }            // Unread messages
```

### Example Document
```json
{
  "_id": "507f1f77bcf86cd799439015",
  "text": "Can you explain this physics concept?",
  "type": "text",
  "from": "student",
  "fromId": "507f1f77bcf86cd799439011",
  "fromName": "Ahmed Rashwan",
  "toId": "507f1f77bcf86cd799439012",
  "toRole": "assistant",
  "threadId": "chat:507f1f77bcf86cd799439011",
  "status": "delivered",
  "read": false,
  "createdAt": "2025-12-20T10:00:00Z",
  "updatedAt": "2025-12-20T10:00:00Z"
}
```

---

## 🎨 Theme Model

**File:** `/backend/models/Theme.js`

### Schema
```javascript
{
  _id: ObjectId,
  
  // User Theme
  userId: ObjectId (ref: User, required, unique),
  themeName: String (required),
  // Valid themes: 'default', 'theme-dark', 'theme-light', 
  //              'theme-ocean', 'theme-sunset', 'theme-purple', 'theme-forest'
  
  // Who Applied
  appliedBy: ObjectId (ref: User, required),
  appliedByRole: Enum ['admin', 'developer', 'assistant', 'user'],
  
  // Timestamps
  appliedAt: Date (default: now),
  updatedAt: Date (default: now)
}
```

### Indexes
```javascript
{ userId: 1 }     // Unique lookup
{ appliedBy: 1 }  // Admin audit trail
```

### Example Document
```json
{
  "_id": "507f1f77bcf86cd799439016",
  "userId": "507f1f77bcf86cd799439011",
  "themeName": "theme-ocean",
  "appliedBy": "507f1f77bcf86cd799439012",
  "appliedByRole": "admin",
  "appliedAt": "2025-12-20T15:30:00Z",
  "updatedAt": "2025-12-20T15:30:00Z"
}
```

---

## 🏠 LiveSession Model

**File:** `/backend/models/LiveSession.js`

### Schema
```javascript
{
  _id: ObjectId,
  
  // Session Information
  title: String (required),
  description: String (optional),
  
  // Curriculum
  curriculum: Enum ['american', 'national'],
  grade: Number (9-12),
  
  // Schedule
  scheduledAt: Date (required),
  duration: Number (minutes, default: 60),
  startedAt: Date (optional),
  endedAt: Date (optional),
  
  // Status
  status: Enum ['scheduled', 'live', 'ended', 'cancelled'],
  
  // Access Control
  accessCode: String (optional),
  participants: [ObjectId] (ref: User),
  participantCount: Number (default: 0),
  
  // Meeting Information
  zoomUrl: String (optional),
  googleMeetUrl: String (optional),
  recordingUrl: String (optional),
  
  // Host Information
  createdBy: ObjectId (ref: User),
  createdByRole: String,
  
  // Timestamps
  createdAt: Date (default: now),
  updatedAt: Date (default: now)
}
```

### Example Document
```json
{
  "_id": "507f1f77bcf86cd799439017",
  "title": "Physics Basics - Live Session",
  "curriculum": "american",
  "grade": 10,
  "scheduledAt": "2025-12-21T10:00:00Z",
  "duration": 60,
  "status": "scheduled",
  "participants": [],
  "participantCount": 0,
  "zoomUrl": "https://zoom.us/j/123456789",
  "createdBy": "507f1f77bcf86cd799439012",
  "createdByRole": "teacher",
  "createdAt": "2025-12-20T10:00:00Z",
  "updatedAt": "2025-12-20T10:00:00Z"
}
```

---

## 📝 Homework Model

**File:** `/backend/models/Homework.js`

### Schema
```javascript
{
  _id: ObjectId,
  
  // Assignment Details
  title: String (required),
  description: String,
  
  // Curriculum
  curriculum: Enum ['american', 'national'],
  grade: Number (9-12),
  
  // Dates
  assignedAt: Date (default: now),
  dueDate: Date (required),
  
  // Status
  status: Enum ['open', 'closed'],
  
  // Content
  content: String (HTML),
  attachments: [String] (file URLs),
  
  // Creator
  createdBy: ObjectId (ref: User),
  createdByRole: String,
  
  // Submissions
  submissions: [{
    studentId: ObjectId,
    submittedAt: Date,
    content: String,
    attachments: [String],
    grade: Number,
    feedback: String
  }]
}
```

---

## 📚 Worksheet Model

**File:** `/backend/models/Worksheet.js`

### Schema
```javascript
{
  _id: ObjectId,
  
  // Worksheet Details
  title: String (required),
  
  // Curriculum
  curriculum: Enum ['american', 'national'],
  grade: Number (9-12),
  
  // Content
  content: String (HTML),
  questions: [{
    questionId: String,
    text: String,
    type: Enum ['multiple-choice', 'short-answer', 'essay'],
    options: [String],
    correctAnswer: String
  }],
  
  // Metadata
  createdBy: ObjectId (ref: User),
  
  // Timestamps
  createdAt: Date (default: now),
  updatedAt: Date (default: now)
}
```

---

## 📊 Order Model

**File:** `/backend/models/Order.js` (if implementing e-commerce)

### Schema
```javascript
{
  _id: ObjectId,
  
  // Order Information
  orderId: String (unique),
  status: Enum ['pending', 'completed', 'cancelled', 'refunded'],
  
  // Customer
  studentId: ObjectId (ref: User),
  
  // Items
  items: [{
    productId: ObjectId,
    quantity: Number,
    price: Number
  }],
  
  // Pricing
  subtotal: Number,
  tax: Number,
  total: Number,
  
  // Dates
  createdAt: Date (default: now),
  updatedAt: Date (default: now)
}
```

---

## 🔐 SecurityLog Model

**File:** `/backend/models/SecurityLog.js`

### Schema
```javascript
{
  _id: ObjectId,
  
  // Log Information
  type: Enum [
    'login', 'logout', 'failed_login',
    'password_changed', 'access_code_used',
    'data_edited', 'account_blocked', 'account_approved'
  ],
  
  // User Information
  userId: ObjectId (ref: User),
  userName: String,
  userRole: String,
  
  // Details
  description: String,
  ipAddress: String,
  userAgent: String,
  
  // Severity
  severity: Enum ['low', 'medium', 'high', 'critical'],
  
  // Timestamp
  createdAt: Date (default: now)
}
```

### Example Document
```json
{
  "_id": "507f1f77bcf86cd799439018",
  "type": "password_changed",
  "userId": "507f1f77bcf86cd799439011",
  "userName": "Ahmed Rashwan",
  "userRole": "student",
  "description": "Student changed password",
  "ipAddress": "192.168.1.1",
  "severity": "low",
  "createdAt": "2025-12-20T14:00:00Z"
}
```

---

## 🔄 Relationships & References

### User Relationships
```
User
├── Videos (createdBy, approvedBy)
├── Messages (from, to)
├── AccessCodes (createdBy)
├── LiveSessions (createdBy)
├── Theme (userId - one per user)
└── SecurityLogs
```

### Video Relationships
```
Video
├── User (createdBy)
├── AccessCodes (linked via linkedResource)
└── LiveSessions (optional inclusion)
```

### Message Relationships
```
Message
├── User (fromId, toId)
└── Message (parentMessageId for replies)
```

---

## 📈 Database Query Examples

### Get Student with All Information
```javascript
User.findById(studentId)
  .select('-password')
  .populate([
    { path: 'approvedBy', select: 'firstName lastName' }
  ])
```

### Get Videos for Specific Grade/Curriculum
```javascript
Video.find({ 
  grade: 10, 
  curriculum: 'american',
  status: 'published'
})
.populate('createdBy', 'firstName lastName')
.sort({ createdAt: -1 })
```

### Get Unread Messages for User
```javascript
Message.find({
  toId: userId,
  read: false
})
.populate('fromId', 'firstName lastName')
.sort({ createdAt: -1 })
```

### Get User's Theme
```javascript
Theme.findOne({ userId: studentId })
.populate('appliedBy', 'firstName lastName')
```

---

## 🔒 Data Privacy

- Passwords: Hashed with SHA256 + salt
- Sensitive Fields: Excluded from public API responses
- User Data: Only accessible to authorized roles
- Audit Trail: All changes logged to SecurityLog
- GDPR Compliance: Data deletion requests handled

**Last Updated:** December 20, 2025
