const express = require('express');
const router = express.Router();
const GroupChat = require('../models/GroupChat');
const { authMiddleware, authorize } = require('../middleware/auth');
const { ObjectId } = require('mongoose').Types;

router.post('/create', authMiddleware, authorize(['admin', 'assistant', 'developer']), async (req, res) => {
  try {
    const { name, description, type } = req.body;
    if (!name || name.length < 3) return res.status(400).json({ error: 'Name required' });
    const group = new GroupChat({
      name, description: description || '', type: type || 'classroom',
      createdBy: req.user.id, members: [{ userId: req.user.id, role: 'admin' }], admins: [req.user.id]
    });
    await group.save();
    res.json({ success: true, data: group });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed' });
  }
});

router.get('/my-groups', authMiddleware, async (req, res) => {
  try {
    const g = await GroupChat.find({ 'members.userId': req.user.id, isArchived: false })
      .select('name description avatar members messageCount lastMessage lastMessageAt').limit(50);
    res.json({ data: g });
  } catch (e) {
    res.status(500).json({ error: 'Failed' });
  }
});

router.put('/:groupId', authMiddleware, async (req, res) => {
  try {
    const { name, description, type } = req.body;
    const g = await GroupChat.findById(req.params.groupId);
    if (!g) return res.status(404).json({ error: 'Not found' });
    if (!g.admins.includes(req.user.id)) return res.status(403).json({ error: 'Denied' });

    if (name) g.name = name;
    if (description !== undefined) g.description = description;
    if (type) g.type = type;

    await g.save();
    res.json({ success: true, data: g });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed' });
  }
});

router.get('/:groupId/members', authMiddleware, async (req, res) => {
  try {
    const g = await GroupChat.findById(req.params.groupId);
    if (!g) return res.status(404).json({ error: 'Not found' });
    res.json({ data: g.members });
  } catch (e) {
    res.status(500).json({ error: 'Failed' });
  }
});

router.get('/:groupId', authMiddleware, async (req, res) => {
  try {
    const g = await GroupChat.findById(req.params.groupId);
    if (!g) return res.status(404).json({ error: 'Not found' });
    if (!g.members.some(m => m.userId.toString() === req.user.id)) return res.status(403).json({ error: 'Not member' });
    res.json({ data: g });
  } catch (e) {
    res.status(500).json({ error: 'Failed' });
  }
});

router.post('/:groupId/send-message', authMiddleware, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { content, type } = req.body;
    if (!content) return res.status(400).json({ error: 'Empty' });
    const g = await GroupChat.findById(groupId);
    if (!g) return res.status(404).json({ error: 'Not found' });
    if (!g.members.some(m => m.userId.toString() === req.user.id)) return res.status(403).json({ error: 'Not member' });

    const senderName = req.user.firstName || req.user.name || req.user.role || 'Staff';
    const msg = {
      _id: new ObjectId(),
      senderId: req.user.id,
      senderName: senderName,
      senderDisplayName: req.user.displayName || senderName,
      content,
      type: type || 'text',
      createdAt: new Date(),
      isEdited: false,
      isDeleted: false
    };

    // إضافة الرسالة إلى المصفوفة
    g.messages.push(msg);
    g.lastMessage = content.substring(0, 100);
    g.lastMessageAt = new Date();
    g.lastMessageBy = req.user.id;
    g.messageCount = (g.messageCount || 0) + 1;
    await g.save();
    res.json({ data: msg });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed' });
  }
});

router.get('/:groupId/messages', authMiddleware, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { page = 1, limit = 50 } = req.query;

    const g = await GroupChat.findById(groupId);
    if (!g) return res.status(404).json({ error: 'Not found' });
    if (!g.members.some(m => m.userId.toString() === req.user.id)) return res.status(403).json({ error: 'Not member' });

    // الحصول على الرسائل مع التصفحية (pagination)
    const skip = (page - 1) * limit;
    const messages = g.messages.slice(-limit).reverse(); // آخر الرسائل أولاً

    res.json({
      data: {
        messages,
        page: parseInt(page),
        limit: parseInt(limit),
        total: g.messages.length
      }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed' });
  }
});

router.post('/:groupId/add-member', authMiddleware, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { userId } = req.body;
    const g = await GroupChat.findById(groupId);
    if (!g || !g.admins.includes(req.user.id)) return res.status(403).json({ error: 'Denied' });
    if (g.members.some(m => m.userId.toString() === userId)) return res.status(400).json({ error: 'Already member' });
    g.members.push({ userId, role: 'member' });
    await g.save();
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed' });
  }
});

router.delete('/:groupId/remove-member/:userId', authMiddleware, async (req, res) => {
  try {
    const { groupId, userId } = req.params;
    const g = await GroupChat.findById(groupId);
    if (!g || !g.admins.includes(req.user.id)) return res.status(403).json({ error: 'Denied' });
    g.members = g.members.filter(m => m.userId.toString() !== userId);
    await g.save();
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed' });
  }
});

router.delete('/:groupId', authMiddleware, async (req, res) => {
  try {
    const g = await GroupChat.findById(req.params.groupId);
    if (!g || g.createdBy.toString() !== req.user.id) return res.status(403).json({ error: 'Denied' });
    await GroupChat.deleteOne({ _id: req.params.groupId });
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed' });
  }
});

module.exports = router;
