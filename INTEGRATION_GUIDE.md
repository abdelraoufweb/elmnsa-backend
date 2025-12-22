# Frontend Integration Guide

## Quick Start

### 1. Install Socket.IO Client
```bash
npm install socket.io-client
# or
yarn add socket.io-client
```

### 2. Initialize Backend Connection

```javascript
import io from 'socket.io-client';

const socket = io('http://localhost:5000', {
  auth: {
    token: localStorage.getItem('authToken')
  },
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: 5
});

socket.on('connect', () => {
  console.log('✅ Connected to backend');
});

socket.on('disconnect', () => {
  console.log('❌ Disconnected from backend');
});
```

---

## Authentication Integration

### Register Function
```javascript
async function handleRegistration(formData) {
  try {
    const response = await fetch('http://localhost:5000/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });

    const result = await response.json();
    
    if (result.success) {
      localStorage.setItem('authToken', result.data.token);
      localStorage.setItem('user', JSON.stringify(result.data.user));
      window.location.href = '/dashboard';
    } else {
      showError(result.message);
    }
  } catch (error) {
    showError('Registration failed: ' + error.message);
  }
}
```

### Login Function
```javascript
async function studentLogin(phoneNumber, password) {
  try {
    const response = await fetch('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber, password })
    });

    const result = await response.json();
    
    if (result.success) {
      localStorage.setItem('authToken', result.data.token);
      localStorage.setItem('user', JSON.stringify(result.data.user));
      
      // Update UI with user role
      currentUser = result.data.user;
      updateUIForRole(result.data.user.role);
      
      return result.data;
    } else {
      throw new Error(result.message);
    }
  } catch (error) {
    showError('Login failed: ' + error.message);
  }
}
```

### Verify Access Code
```javascript
async function verifyAccessCode(code, type = 'video') {
  const token = localStorage.getItem('authToken');
  
  try {
    const response = await fetch('http://localhost:5000/api/auth/verify-access-code', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ code, type })
    });

    const result = await response.json();
    
    if (result.success) {
      if (type === 'video') {
        currentUser.videoAccessUnlocked = true;
      } else if (type === 'ai') {
        currentUser.aiAccessUnlocked = true;
      }
      localStorage.setItem('user', JSON.stringify(currentUser));
      showSuccess(result.message);
      return true;
    } else {
      showError(result.message);
      return false;
    }
  } catch (error) {
    showError('Verification failed: ' + error.message);
  }
}
```

---

## API Helper Function

```javascript
const API_BASE_URL = 'http://localhost:5000/api';

async function apiCall(endpoint, options = {}) {
  const token = localStorage.getItem('authToken');
  
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers
  });

  const data = await response.json();

  if (!response.ok && response.status === 401) {
    // Token expired, redirect to login
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
    window.location.href = '/login';
  }

  return data;
}
```

---

## Student Dashboard Integration

### Load Videos
```javascript
async function loadStudentVideos() {
  const params = new URLSearchParams();
  
  if (currentUser.curriculum) params.append('curriculum', currentUser.curriculum);
  if (currentUser.grade) params.append('grade', currentUser.grade);

  const result = await apiCall(`/students/videos?${params}`);
  
  if (result.success) {
    displayVideos(result.data);
  }
}

function displayVideos(videos) {
  const videosContainer = document.getElementById('videos-list');
  videosContainer.innerHTML = videos.map(video => `
    <div class="video-card">
      <h3>${video.title}</h3>
      <p>${video.description}</p>
      <button onclick="playVideo('${video._id}')">Watch</button>
    </div>
  `).join('');
}
```

### Load Worksheets
```javascript
async function loadStudentWorksheets() {
  const result = await apiCall('/students/worksheets');
  
  if (result.success) {
    displayWorksheets(result.data);
  }
}
```

### Upload Homework
```javascript
async function uploadHomework(formData) {
  const token = localStorage.getItem('authToken');
  
  const response = await fetch('http://localhost:5000/api/students/homework', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    },
    body: formData // Already FormData from file input
  });

  const result = await response.json();
  
  if (result.success) {
    showSuccess('Homework uploaded successfully');
    showHomeworkId(result.data._id);
  }
}

// In your homework form submit handler
document.getElementById('homework-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const formData = new FormData();
  formData.append('file', document.getElementById('homework-file').files[0]);
  formData.append('notes', document.getElementById('homework-notes').value);
  
  await uploadHomework(formData);
});
```

### Load My Homework
```javascript
async function loadMyHomework() {
  const result = await apiCall('/students/my-homework');
  
  if (result.success) {
    displayHomework(result.data);
  }
}
```

---

## Chat Integration

### Send Message
```javascript
function sendMessage(text) {
  const toId = currentAssistantChat;
  
  socket.emit('message:send', {
    fromId: currentUser._id,
    toId,
    fromName: currentUser.fullName,
    fromRole: currentUser.role,
    text,
    threadId: [currentUser._id, toId].sort().join('-')
  });
}

socket.on('message:sent', (message) => {
  appendMessageToChat(message, 'sent');
});

socket.on('message:receive', (message) => {
  appendMessageToChat(message, 'received');
});
```

### Typing Indicator
```javascript
let typingTimeout;

document.getElementById('chat-input').addEventListener('input', () => {
  socket.emit('typing:start', {
    fromId: currentUser._id,
    toId: currentAssistantChat,
    fromName: currentUser.fullName
  });

  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    socket.emit('typing:stop', {
      fromId: currentUser._id,
      toId: currentAssistantChat
    });
  }, 1000);
});

socket.on('typing:indicator', (data) => {
  showTypingIndicator(data.fromName);
});

socket.on('typing:stop', (data) => {
  hideTypingIndicator(data.fromId);
});
```

### Mark as Read
```javascript
function markMessageAsRead(messageId, fromId) {
  socket.emit('message:read', {
    messageId,
    toId: fromId
  });
}

socket.on('message:mark_read', (data) => {
  markMessageAsReadInUI(data.messageId);
});
```

---

## Store Integration

### Load Products
```javascript
async function loadStoreProducts(category) {
  const params = new URLSearchParams();
  if (category) params.append('category', category);
  
  const result = await apiCall(`/store/products?${params}`);
  
  if (result.success) {
    displayProducts(result.data);
  }
}

function displayProducts(products) {
  const storeContainer = document.getElementById('store-products');
  storeContainer.innerHTML = products.map(product => `
    <div class="product-card">
      <img src="${product.imageUrl}" alt="${product.name}">
      <h3>${product.name}</h3>
      <p class="price">${product.price} ${product.currency}</p>
      <button onclick="addToCart('${product._id}', 1)">Add to Cart</button>
    </div>
  `).join('');
}
```

### Create Order
```javascript
async function completePurchase(items, buyerInfo) {
  const result = await apiCall('/store/orders', {
    method: 'POST',
    body: JSON.stringify({
      items,
      buyerPhone: buyerInfo.phone,
      buyerEmail: buyerInfo.email,
      buyerAddress: buyerInfo.address
    })
  });

  if (result.success) {
    showSuccess(`Order created! Order ID: ${result.data.orderId}`);
    
    // Broadcast to admins
    socket.emit('order:broadcast', {
      orderId: result.data.orderId,
      buyerName: currentUser.fullName,
      items: items.length,
      total: result.data.total
    });
    
    return result.data;
  }
}
```

### Get My Orders
```javascript
async function loadMyOrders() {
  const result = await apiCall('/store/orders');
  
  if (result.success) {
    displayOrders(result.data);
  }
}
```

---

## Admin Dashboard Integration

### Pending Accounts
```javascript
async function loadPendingAccounts() {
  const result = await apiCall('/admin/pending-accounts');
  
  if (result.success) {
    displayPendingAccounts(result.data);
  }
}

function approveAccount(userId) {
  apiCall(`/admin/approve-account/${userId}`, { method: 'POST' })
    .then(result => {
      if (result.success) {
        showSuccess('Account approved');
        loadPendingAccounts();
      }
    });
}

function rejectAccount(userId, reason) {
  apiCall(`/admin/reject-account/${userId}`, {
    method: 'POST',
    body: JSON.stringify({ reason })
  }).then(result => {
    if (result.success) {
      showSuccess('Account rejected');
      loadPendingAccounts();
    }
  });
}

function blockAccount(userId, reason) {
  apiCall(`/admin/block-account/${userId}`, {
    method: 'POST',
    body: JSON.stringify({ reason })
  }).then(result => {
    if (result.success) {
      showSuccess('Account blocked');
      loadPendingAccounts();
    }
  });
}

function unblockAccount(userId) {
  apiCall(`/admin/unblock-account/${userId}`, {
    method: 'POST'
  }).then(result => {
    if (result.success) {
      showSuccess('Account unblocked');
      loadPendingAccounts();
    }
  });
}
```

### Homework Management
```javascript
async function loadAllHomework(status = null) {
  const params = new URLSearchParams();
  if (status) params.append('status', status);
  
  const result = await apiCall(`/admin/homework?${params}`);
  
  if (result.success) {
    displayHomeworkForGrading(result.data);
  }
}

function gradeHomework(homeworkId, grade, feedback) {
  apiCall(`/admin/grade-homework/${homeworkId}`, {
    method: 'POST',
    body: JSON.stringify({ grade, feedback })
  }).then(result => {
    if (result.success) {
      showSuccess('Homework graded');
      loadAllHomework();
    }
  });
}
```

### Send Announcements
```javascript
async function sendAnnouncement(title, message, target = 'all', priority = 'normal') {
  const result = await apiCall('/admin/announcements', {
    method: 'POST',
    body: JSON.stringify({
      title,
      message,
      target,
      priority
    })
  });

  if (result.success) {
    showSuccess('Announcement sent');
  }
}
```

---

## Live Class Integration

### Create Session
```javascript
function createLiveSession(title, audience = 'all') {
  socket.emit('live:create_session', {
    hostId: currentUser._id,
    title,
    audience
  });

  socket.on('live:session_created', (data) => {
    displayLiveClassUI(data.sessionCode);
    copyToClipboard(data.sessionCode);
  });
}
```

### Join Session
```javascript
function joinLiveSession(sessionCode) {
  socket.emit('live:join', {
    sessionCode,
    userId: currentUser._id,
    userName: currentUser.fullName,
    userRole: currentUser.role
  });

  socket.on('live:user_joined', (data) => {
    addParticipantToList(data.userId, data.userName);
  });
}
```

### Screen Sharing
```javascript
async function startScreenShare(sessionCode) {
  const stream = await navigator.mediaDevices.getDisplayMedia({ 
    video: true 
  });

  socket.emit('live:screen_share', {
    sessionCode,
    userId: currentUser._id
  });

  // Handle stream...
}

function stopScreenShare(sessionCode) {
  socket.emit('live:stop_screen_share', {
    sessionCode,
    userId: currentUser._id
  });
}

socket.on('live:screen_shared', (data) => {
  console.log(`${data.userId} is now sharing`);
});

socket.on('live:screen_stopped', (data) => {
  console.log(`${data.userId} stopped sharing`);
});
```

### Leave Session
```javascript
function leaveLiveSession(sessionCode) {
  socket.emit('live:leave', {
    sessionCode,
    userId: currentUser._id
  });
}

socket.on('live:user_left', (data) => {
  console.log(`Participant left. Remaining: ${data.totalParticipants}`);
});
```

---

## Notifications Integration

### Subscribe to Notifications
```javascript
function subscribeToNotifications() {
  socket.emit('notification:subscribe', currentUser._id);

  socket.on('notification:new', (notification) => {
    displayNotification(notification);
    playNotificationSound();
  });
}

// Call on login
subscribeToNotifications();
```

### Send Notification (Admin)
```javascript
function sendNotificationToStudent(studentId, title, message, type = 'system') {
  socket.emit('notification:send', {
    recipientId: studentId,
    title,
    message,
    type
  });
}
```

---

## AI Chat Integration

### Send AI Message
```javascript
async function sendAIMessage(text) {
  try {
    const response = await fetch('http://localhost:5000/api/ai/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('authToken')}`
      },
      body: JSON.stringify({
        message: text,
        conversationHistory: aiConversationHistory
      })
    });

    const result = await response.json();
    
    if (result.success) {
      displayAIResponse(result.data.message);
      aiConversationHistory.push({
        role: 'assistant',
        content: result.data.message
      });
    }
  } catch (error) {
    console.error('AI Chat error:', error);
  }
}
```

---

## Error Handling

```javascript
function handleApiError(error) {
  if (error.error === 'ACCOUNT_BLOCKED') {
    showError(`Account blocked: ${error.reason}`);
    logout();
  } else if (error.error === 'ACCOUNT_SUSPENDED') {
    showError(`Account suspended: ${error.reason}`);
    logout();
  } else if (error.error === 'TOKEN_EXPIRED') {
    refreshToken();
  } else if (error.error === 'PERMISSION_DENIED') {
    showError('You do not have permission for this action');
  } else {
    showError(error.message);
  }
}
```

---

## Best Practices

✅ Always store auth token securely
✅ Refresh token before expiry
✅ Validate user input on client
✅ Handle connection errors gracefully
✅ Implement rate limiting UI feedback
✅ Cache frequently accessed data
✅ Use WebRTC properly with signaling
✅ Handle real-time data conflicts

---

## Testing

```bash
# Start backend
npm run dev

# Test API endpoints using curl or Postman
curl -X GET http://localhost:5000/health

# Test Socket.IO connection
# See browser console for connection logs
```

---

## Troubleshooting

### CORS Error
- Check `FRONTEND_URL` in `.env`
- Ensure frontend and backend have matching origins

### Auth Token Issues
- Clear localStorage and re-login
- Check token expiry time
- Verify JWT_SECRET is correct

### Real-Time Not Working
- Check Socket.IO connection in browser console
- Verify firewall isn't blocking WebSocket
- Check for CORS issues

### File Upload Issues
- Verify file size doesn't exceed 50MB
- Check file type is allowed
- Ensure /uploads directory exists

---

## Deployment Checklist

- [ ] Update `.env` with production URLs
- [ ] Set `NODE_ENV=production`
- [ ] Use HTTPS for production
- [ ] Configure MongoDB Atlas connection
- [ ] Set secure JWT_SECRET
- [ ] Set up email/SMS notifications
- [ ] Configure file storage (S3 or similar)
- [ ] Enable rate limiting
- [ ] Set up monitoring/logging
- [ ] Configure backups

---

**Version:** 1.0.0
**Last Updated:** 2024
