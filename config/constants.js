// ==========================================
// APPLICATION CONSTANTS
// ==========================================

module.exports = {
  // User Roles
  ROLES: {
    DEVELOPER: 'developer',
    ADMIN: 'admin',
    ASSISTANT: 'assistant',
    STUDENT: 'student',
    PARENT: 'parent',
    GUEST: 'guest'
  },

  // Account Status
  ACCOUNT_STATUS: {
    PENDING: 'pending',
    APPROVED: 'approved',
    BLOCKED: 'blocked',
    SUSPENDED: 'suspended',
    REJECTED: 'rejected'
  },

  // Permissions by Role
  PERMISSIONS: {
    developer: ['all'],
    admin: [
      'view_students',
      'approve_accounts',
      'reject_accounts',
      'block_accounts',
      'unblock_accounts',
      'manage_videos',
      'manage_worksheets',
      'manage_schedules',
      'view_homework',
      'grade_homework',
      'view_chats',
      'reply_chats',
      'manage_store',
      'send_announcements',
      'start_live_call',
      'view_orders'
    ],
    assistant: [
      'view_students',
      'approve_accounts',
      'reject_accounts',
      'manage_videos',
      'manage_worksheets',
      'manage_schedules',
      'view_homework',
      'grade_homework',
      'view_chats',
      'reply_chats',
      'manage_store',
      'send_announcements',
      'send_messages',
      'start_live_call',
      'view_orders'
    ],
    student: [
      'view_own_content',
      'upload_homework',
      'chat_assistant',
      'join_live_call',
      'browse_store',
      'place_order'
    ],
    parent: ['view_children', 'view_announcements', 'browse_store'],
    guest: ['browse_store']
  },

  // Homework Status
  HOMEWORK_STATUS: {
    PENDING: 'pending',
    GRADED: 'graded'
  },

  // Order Status
  ORDER_STATUS: {
    PENDING: 'pending',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled'
  },

  // Schedule Status
  SCHEDULE_STATUS: {
    DRAFT: 'draft',
    SENT: 'sent',
    CANCELLED: 'cancelled'
  },

  // Curriculum Types
  CURRICULA: ['american', 'national'],

  // Grades
  GRADES: [9, 10, 11, 12],

  // Message Types
  MESSAGE_TYPE: {
    TEXT: 'text',
    FILE: 'file',
    IMAGE: 'image',
    SYSTEM: 'system'
  },

  // Notification Types
  NOTIFICATION_TYPE: {
    ANNOUNCEMENT: 'announcement',
    HOMEWORK: 'homework',
    HOMEWORK_GRADED: 'homework_graded',
    SCHEDULE: 'schedule',
    CHAT: 'chat',
    VIDEO: 'video',
    WORKSHEET: 'worksheet',
    ORDER: 'order',
    LIVE_CLASS: 'live_class',
    SYSTEM: 'system',
    WHATSAPP_CONTENT: 'wa_content',
    WHATSAPP_GRADE: 'wa_grade',
    WHATSAPP_APPROVAL: 'wa_approval',
    WHATSAPP_REGISTRATION: 'wa_registration',
    WHATSAPP_REPORT: 'wa_report'
  },

  // Socket.IO Events
  SOCKET_EVENTS: {
    // Chat
    NEW_MESSAGE: 'new_message',
    MESSAGE_READ: 'message_read',
    TYPING: 'typing',
    STOP_TYPING: 'stop_typing',

    // Notifications
    NEW_NOTIFICATION: 'new_notification',
    NOTIFICATION_READ: 'notification_read',

    // Live Class
    JOIN_CLASS: 'join_class',
    LEAVE_CLASS: 'leave_class',
    USER_JOINED: 'user_joined',
    USER_LEFT: 'user_left',
    SCREEN_SHARE: 'screen_share',
    STOP_SCREEN_SHARE: 'stop_screen_share',
    PARTICIPANT_UPDATE: 'participant_update',

    // Orders
    NEW_ORDER: 'new_order',
    ORDER_STATUS_UPDATE: 'order_status_update',

    // Real-time updates
    DATA_UPDATE: 'data_update',

    // WhatsApp
    WHATSAPP_STATUS: 'whatsapp:status',
    WHATSAPP_QR: 'whatsapp:qr'
  }
};
