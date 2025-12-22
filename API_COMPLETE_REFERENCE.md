# Backend API Documentation - Complete Reference

## 📍 Base URL
```
http://localhost:5000/api
```

## 🔐 Authentication
All protected endpoints require JWT token in header:
```
Authorization: Bearer <jwt_token>
```

---

## 🔑 Authentication Endpoints

### 1. Register Student
**POST** `/auth/register`

Request Body:
```json
{
  "firstName": "Ahmed",
  "lastName": "Rashwan",
  "phoneNumber": "01234567890",
  "parentPhone": "01234567891",
  "password": "securePassword",
  "grade": 10,
  "curriculum": "american",
  "schoolName": "Cairo High School"
}
```

Response (201):
```json
{
  "success": true,
  "message": "Student registered successfully",
  "data": {
    "id": "user_id",
    "firstName": "Ahmed",
    "role": "student",
    "status": "pending"
  },
  "token": "jwt_token"
}
```

### 2. Login (Any Role)
**POST** `/auth/login`

Request Body:
```json
{
  "phoneNumber": "01234567890",
  "password": "securePassword"
}
```

Response (200):
```json
{
  "success": true,
  "data": {
    "id": "user_id",
    "firstName": "Ahmed",
    "lastName": "Rashwan",
    "role": "student",
    "grade": 10,
    "curriculum": "american"
  },
  "token": "jwt_token"
}
```

### 3. Verify Access Code
**POST** `/auth/verify-access-code`

Request Body:
```json
{
  "code": "DEV123456789",
  "codeType": "developer"
}
```

Response (200):
```json
{
  "success": true,
  "message": "Access code verified",
  "data": {
    "valid": true,
    "accessType": "developer"
  }
}
```

### 4. Get Current User
**GET** `/auth/me`

Response (200):
```json
{
  "success": true,
  "data": {
    "id": "user_id",
    "firstName": "Ahmed",
    "lastName": "Rashwan",
    "role": "student",
    "grade": 10
  }
}
```

### 5. Refresh Token
**POST** `/auth/refresh-token`

Response (200):
```json
{
  "success": true,
  "token": "new_jwt_token"
}
```

---

## 🎬 Video Endpoints

### 1. List Videos
**GET** `/videos`

Query Parameters:
- `grade` (optional): 9|10|11|12
- `curriculum` (optional): american|national
- `page` (optional): default 1
- `limit` (optional): default 10

Response (200):
```json
{
  "success": true,
  "data": [
    {
      "id": "video_id",
      "title": "Physics Basics",
      "description": "Introduction to Physics",
      "youtubeUrl": "https://youtube.com/watch?v=...",
      "mp4Url": "https://...",
      "curriculum": "american",
      "grade": 10,
      "supportedQualities": ["720p", "1080p"],
      "defaultQuality": "720p",
      "createdAt": "2025-12-20T10:00:00Z"
    }
  ],
  "pagination": {
    "total": 50,
    "page": 1,
    "pages": 5
  }
}
```

### 2. Get Video Details
**GET** `/videos/:videoId`

Response (200):
```json
{
  "success": true,
  "data": {
    "id": "video_id",
    "title": "Physics Basics",
    "description": "Introduction to Physics",
    "youtubeUrl": "https://youtube.com/watch?v=...",
    "youtubeId": "dQw4w9WgXcQ",
    "mp4Url": "https://...",
    "curriculum": "american",
    "grade": 10,
    "supportedQualities": ["720p", "1080p"],
    "defaultQuality": "720p",
    "createdBy": {
      "id": "admin_id",
      "firstName": "Admin",
      "role": "admin"
    },
    "createdAt": "2025-12-20T10:00:00Z"
  }
}
```

### 3. Create Video (Admin/Assistant/Developer)
**POST** `/videos`

Request Body:
```json
{
  "title": "Physics Basics",
  "description": "Introduction to Physics",
  "youtubeUrl": "https://youtube.com/watch?v=dQw4w9WgXcQ",
  "mp4Url": "base64_or_file_path",
  "curriculum": "american",
  "grade": 10,
  "supportedQualities": ["720p", "1080p"],
  "defaultQuality": "720p",
  "needsAccessCodes": false
}
```

Response (201):
```json
{
  "success": true,
  "message": "Video created successfully",
  "data": {
    "id": "video_id",
    "title": "Physics Basics",
    "createdAt": "2025-12-20T10:00:00Z"
  }
}
```

### 4. Upload MP4 File
**POST** `/videos/:videoId/upload-mp4`

Content-Type: `multipart/form-data`

FormData:
```
file: <mp4_file>
quality: "720p" (optional)
```

Response (200):
```json
{
  "success": true,
  "message": "MP4 uploaded successfully",
  "data": {
    "mp4Url": "https://...",
    "quality": "720p"
  }
}
```

### 5. Create Video Access Codes
**POST** `/videos/:videoId/access-codes`

Request Body:
```json
{
  "codes": [
    {
      "code": "VIDEO123456789",
      "maxUsers": 50,
      "expiryDays": 30
    }
  ]
}
```

Response (201):
```json
{
  "success": true,
  "data": {
    "codesCreated": 1
  }
}
```

### 6. Get Video Access Codes (Admin/Developer)
**GET** `/videos/:videoId/access-codes`

Response (200):
```json
{
  "success": true,
  "data": [
    {
      "id": "code_id",
      "code": "VIDEO123456789",
      "active": true,
      "currentUsers": 25,
      "maxUsers": 50,
      "expiryDate": "2026-01-19T10:00:00Z"
    }
  ]
}
```

### 7. Delete Video Access Code
**DELETE** `/videos/:videoId/access-codes/:codeId`

Response (200):
```json
{
  "success": true,
  "message": "Access code deleted"
}
```

---

## 👥 Student Endpoints

### 1. List Students (Admin/Assistant/Developer)
**GET** `/students`

Query Parameters:
- `grade` (optional): 9|10|11|12
- `curriculum` (optional): american|national
- `status` (optional): pending|approved|blocked
- `page` (optional): default 1
- `limit` (optional): default 20

Response (200):
```json
{
  "success": true,
  "data": [
    {
      "id": "student_id",
      "firstName": "Ahmed",
      "lastName": "Rashwan",
      "phoneNumber": "01234567890",
      "parentPhone": "01234567891",
      "grade": 10,
      "curriculum": "american",
      "schoolName": "Cairo High School",
      "status": "approved",
      "registeredAt": "2025-12-20T10:00:00Z"
    }
  ],
  "pagination": {
    "total": 150,
    "page": 1,
    "pages": 8
  }
}
```

### 2. Get Student Details
**GET** `/students/:studentId`

Response (200):
```json
{
  "success": true,
  "data": {
    "id": "student_id",
    "firstName": "Ahmed",
    "lastName": "Rashwan",
    "middleName": "Mohamed",
    "phoneNumber": "01234567890",
    "parentPhone": "01234567891",
    "grade": 10,
    "curriculum": "american",
    "schoolName": "Cairo High School",
    "status": "approved",
    "registeredAt": "2025-12-20T10:00:00Z",
    "approvedAt": "2025-12-21T10:00:00Z",
    "approvedBy": "admin_id"
  }
}
```

### 3. Edit Student Data (Admin/Assistant/Developer)
**PUT** `/students/:studentId`

Request Body:
```json
{
  "firstName": "Ahmed",
  "lastName": "Rashwan",
  "middleName": "Mohamed",
  "phoneNumber": "01234567890",
  "parentPhone": "01234567891",
  "grade": 10,
  "curriculum": "american",
  "schoolName": "Cairo High School"
}
```

Response (200):
```json
{
  "success": true,
  "message": "Student data updated successfully",
  "data": {
    "id": "student_id",
    "firstName": "Ahmed",
    "updatedAt": "2025-12-20T15:30:00Z"
  }
}
```

### 4. Delete Student (Admin/Developer)
**DELETE** `/students/:studentId`

Response (200):
```json
{
  "success": true,
  "message": "Student deleted successfully"
}
```

### 5. Apply Theme to Student
**POST** `/students/:studentId/apply-theme`

Request Body:
```json
{
  "themeName": "theme-ocean"
}
```

Response (200):
```json
{
  "success": true,
  "message": "Theme applied successfully",
  "data": {
    "themeName": "theme-ocean",
    "appliedAt": "2025-12-20T15:30:00Z"
  }
}
```

---

## 💬 Message Endpoints

### 1. Get Messages for User
**GET** `/messages`

Query Parameters:
- `threadId` (optional): Filter by thread
- `page` (optional): default 1
- `limit` (optional): default 20

Response (200):
```json
{
  "success": true,
  "data": [
    {
      "id": "message_id",
      "from": "student",
      "fromId": "student_id",
      "fromName": "Ahmed Rashwan",
      "text": "Hello, I need help with Physics",
      "threadId": "chat:student_id",
      "status": "delivered",
      "read": false,
      "createdAt": "2025-12-20T10:00:00Z"
    }
  ],
  "pagination": {
    "total": 45,
    "page": 1,
    "pages": 3
  }
}
```

### 2. Get Thread Messages
**GET** `/messages/:threadId`

Response (200):
```json
{
  "success": true,
  "data": [
    {
      "id": "message_id",
      "from": "student",
      "fromId": "student_id",
      "text": "Hello, I need help",
      "status": "delivered",
      "createdAt": "2025-12-20T10:00:00Z"
    },
    {
      "id": "message_id2",
      "from": "assistant",
      "fromId": "assistant_id",
      "text": "Sure, what do you need?",
      "status": "delivered",
      "createdAt": "2025-12-20T10:05:00Z"
    }
  ]
}
```

### 3. Send Message
**POST** `/messages/send`

Request Body:
```json
{
  "toId": "student_id",
  "text": "Here's the answer to your question",
  "threadId": "chat:student_id"
}
```

Response (201):
```json
{
  "success": true,
  "message": "Message sent successfully",
  "data": {
    "id": "message_id",
    "text": "Here's the answer",
    "status": "delivered",
    "createdAt": "2025-12-20T10:05:00Z"
  }
}
```

### 4. Mark Message as Read
**PUT** `/messages/:messageId/read`

Response (200):
```json
{
  "success": true,
  "message": "Message marked as read"
}
```

### 5. Delete Message
**DELETE** `/messages/:messageId`

Response (200):
```json
{
  "success": true,
  "message": "Message deleted successfully"
}
```

---

## 🎨 Theme Endpoints

### 1. Get All Themes
**GET** `/themes`

Response (200):
```json
{
  "success": true,
  "data": [
    {
      "id": "theme-dark",
      "name": "Dark Theme",
      "description": "Dark color scheme"
    },
    {
      "id": "theme-light",
      "name": "Light Theme",
      "description": "Light color scheme"
    },
    {
      "id": "theme-ocean",
      "name": "Ocean Theme",
      "description": "Ocean blue colors"
    }
  ]
}
```

### 2. Get User's Theme
**GET** `/users/:userId/theme`

Response (200):
```json
{
  "success": true,
  "data": {
    "userId": "user_id",
    "themeName": "theme-ocean",
    "appliedAt": "2025-12-20T15:30:00Z",
    "appliedBy": {
      "id": "admin_id",
      "firstName": "Admin",
      "role": "admin"
    }
  }
}
```

### 3. Apply Theme to User
**POST** `/themes/apply`

Request Body:
```json
{
  "userId": "student_id",
  "themeName": "theme-ocean"
}
```

Response (200):
```json
{
  "success": true,
  "message": "Theme applied successfully",
  "data": {
    "themeName": "theme-ocean",
    "appliedAt": "2025-12-20T15:30:00Z"
  }
}
```

---

## 🛡️ Admin Endpoints

### 1. Get Dashboard Statistics
**GET** `/admin/dashboard`

Response (200):
```json
{
  "success": true,
  "data": {
    "totalStudents": 150,
    "approvedStudents": 120,
    "pendingStudents": 25,
    "blockedStudents": 5,
    "totalVideos": 45,
    "totalMessages": 1250,
    "activeUsers": 35
  }
}
```

### 2. Get Security Logs
**GET** `/admin/logs`

Query Parameters:
- `type` (optional): password|access_code|login|logout|edit
- `days` (optional): default 7
- `page` (optional): default 1

Response (200):
```json
{
  "success": true,
  "data": [
    {
      "id": "log_id",
      "type": "password_changed",
      "userId": "student_id",
      "description": "Student changed password",
      "createdAt": "2025-12-20T10:00:00Z"
    }
  ]
}
```

### 3. Approve Account
**POST** `/admin/approve-account`

Request Body:
```json
{
  "studentId": "student_id"
}
```

Response (200):
```json
{
  "success": true,
  "message": "Account approved successfully"
}
```

### 4. Block User
**POST** `/admin/block-user`

Request Body:
```json
{
  "userId": "user_id",
  "reason": "Violation of terms"
}
```

Response (200):
```json
{
  "success": true,
  "message": "User blocked successfully"
}
```

### 5. Unblock User
**POST** `/admin/unblock-user`

Request Body:
```json
{
  "userId": "user_id"
}
```

Response (200):
```json
{
  "success": true,
  "message": "User unblocked successfully"
}
```

---

## ⚠️ Error Responses

### 400 Bad Request
```json
{
  "success": false,
  "message": "Invalid request data",
  "errors": {
    "phoneNumber": "Invalid phone number format"
  }
}
```

### 401 Unauthorized
```json
{
  "success": false,
  "message": "Unauthorized - Missing or invalid token"
}
```

### 403 Forbidden
```json
{
  "success": false,
  "message": "Forbidden - Insufficient permissions"
}
```

### 404 Not Found
```json
{
  "success": false,
  "message": "Resource not found"
}
```

### 500 Server Error
```json
{
  "success": false,
  "message": "Internal server error",
  "error": "Error details (development only)"
}
```

---

## 🔑 HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | OK |
| 201 | Created |
| 204 | No Content |
| 400 | Bad Request |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not Found |
| 409 | Conflict |
| 422 | Unprocessable Entity |
| 500 | Server Error |

---

**Last Updated:** December 20, 2025
**Version:** 1.0.0
