// ==========================================
// EXAM CONTROLLER
// ==========================================

const Exam = require('../models/Exam');
const Question = require('../models/Question');
const { ExamAttempt, ExamResult } = require('../models/ExamAttempt');
const ExamAccessCode = require('../models/ExamAccessCode');
const { uploadFile, deleteFileFromR2 } = require('../services/s3Service');
const path = require('path');

const ADMIN_ROLES = ['admin', 'assistant', 'developer'];
const QUESTIONS_PER_MODULE_AMERICAN = 22;

// ── Helpers ─────────────────────────────────────────────────

function scaleAmericanScore(rawScore, scaleTable) {
  // scaleTable is a Map<string, number> stored in the Exam document
  const key = String(rawScore);
  if (scaleTable && scaleTable.has(key)) {
    return scaleTable.get(key);
  }
  // Fallback linear approximation if table is missing
  const clamped = Math.max(0, Math.min(44, rawScore));
  return Math.round(200 + (clamped / 44) * 600);
}

function calcNationalScore(questions, answers) {
  // answers: Map<questionId, choiceId>
  let score = 0;
  for (const q of questions) {
    const chosenId = answers.get ? answers.get(String(q._id)) : answers[String(q._id)];
    if (!chosenId || chosenId === 'null') continue;
    const correct = q.choices.find(c => String(c._id) === chosenId && c.isCorrect);
    if (correct) score += q.points || 1;
  }
  return score;
}

function calcRawScore(questions, answers) {
  // returns number of correct answers
  let raw = 0;
  for (const q of questions) {
    const chosenId = answers.get ? answers.get(String(q._id)) : answers[String(q._id)];
    if (!chosenId || chosenId === 'null') continue;
    const correct = q.choices.find(c => String(c._id) === chosenId && c.isCorrect);
    if (correct) raw++;
  }
  return raw;
}

// ──────────────────────────────────────────────────────────
// ADMIN ENDPOINTS
// ──────────────────────────────────────────────────────────

/**
 * Create a new exam
 * POST /api/exams
 */
exports.createExam = async (req, res) => {
  try {
    if (!ADMIN_ROLES.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    const { title, stage, type } = req.body;
    if (!title || !stage || !type) {
      return res.status(400).json({ success: false, message: 'title, stage, and type are required' });
    }

    const exam = await Exam.create({
      title,
      stage: parseInt(stage),
      type,
      createdBy: req.user.id
    });

    res.status(201).json({ success: true, data: exam });
  } catch (error) {
    console.error('createExam error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * List all exams (admin view)
 * GET /api/exams
 */
exports.listExams = async (req, res) => {
  try {
    if (!ADMIN_ROLES.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    const { stage, type, status, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (stage) filter.stage = parseInt(stage);
    if (type) filter.type = type;
    if (status) filter.status = status;

    const exams = await Exam.find(filter)
      .populate('createdBy', 'firstName lastName role')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    // Attach question counts
    const examIds = exams.map(e => e._id);
    const counts = await Question.aggregate([
      { $match: { examId: { $in: examIds } } },
      { $group: { _id: { examId: '$examId', module: '$moduleNumber' }, count: { $sum: 1 } } }
    ]);

    const countMap = {};
    for (const c of counts) {
      const eid = String(c._id.examId);
      if (!countMap[eid]) countMap[eid] = { total: 0, mod1: 0, mod2: 0 };
      countMap[eid].total += c.count;
      if (c._id.module === 1) countMap[eid].mod1 = c.count;
      if (c._id.module === 2) countMap[eid].mod2 = c.count;
    }

    const enriched = exams.map(e => ({
      ...e,
      questionCounts: countMap[String(e._id)] || { total: 0, mod1: 0, mod2: 0 }
    }));

    const total = await Exam.countDocuments(filter);
    res.json({ success: true, data: enriched, pagination: { total, page: parseInt(page), limit: parseInt(limit) } });
  } catch (error) {
    console.error('listExams error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Update exam (title, stage, type, status, scaleTable)
 * PUT /api/exams/:id
 */
exports.updateExam = async (req, res) => {
  try {
    if (!ADMIN_ROLES.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    const exam = await Exam.findById(req.params.id);
    if (!exam) return res.status(404).json({ success: false, message: 'Exam not found' });

    const { title, stage, status, americanScaleTable } = req.body;
    if (title) exam.title = title;
    if (stage) exam.stage = parseInt(stage);
    if (status && ['draft', 'active', 'disabled'].includes(status)) exam.status = status;
    if (americanScaleTable && typeof americanScaleTable === 'object') {
      exam.americanScaleTable = new Map(Object.entries(americanScaleTable));
    }

    await exam.save();
    res.json({ success: true, data: exam });
  } catch (error) {
    console.error('updateExam error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Delete exam (and all its questions)
 * DELETE /api/exams/:id
 */
exports.deleteExam = async (req, res) => {
  try {
    if (!ADMIN_ROLES.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    const exam = await Exam.findById(req.params.id);
    if (!exam) return res.status(404).json({ success: false, message: 'Exam not found' });

    // Only allow delete if exam is draft or disabled (not active)
    if (exam.status === 'active') {
      return res.status(400).json({ success: false, message: 'Cannot delete an active exam. Disable it first.' });
    }

    // Delete images associated with questions from R2
    const questions = await Question.find({ examId: exam._id });
    for (const q of questions) {
      if (q.imageUrl && (q.imageUrl.includes('r2.dev') || q.imageUrl.includes('cloudflarestorage'))) {
        await deleteFileFromR2(q.imageUrl);
      }
    }

    await Question.deleteMany({ examId: exam._id });
    await Exam.findByIdAndDelete(exam._id);

    res.json({ success: true, message: 'Exam, questions, and associated images deleted' });
  } catch (error) {
    console.error('deleteExam error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ──────────────────────────────────────────────────────────
// QUESTION MANAGEMENT
// ──────────────────────────────────────────────────────────

/**
 * Add a question to an exam
 * POST /api/exams/:id/questions
 * Body: { moduleNumber, creationMethod, questionText, choices: [{text, isCorrect}], points }
 * File: optional image upload (field name: 'image')
 */
exports.addQuestion = async (req, res) => {
  try {
    if (!ADMIN_ROLES.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    const exam = await Exam.findById(req.params.id);
    if (!exam) return res.status(404).json({ success: false, message: 'Exam not found' });

    let { moduleNumber, creationMethod, questionText, choices, points } = req.body;
    moduleNumber = parseInt(moduleNumber) || 1;
    creationMethod = creationMethod || 'text';

    // Validate American exam question limits
    if (exam.type === 'american') {
      const existingCount = await Question.countDocuments({
        examId: exam._id,
        moduleNumber
      });
      if (existingCount >= QUESTIONS_PER_MODULE_AMERICAN) {
        return res.status(400).json({
          success: false,
          message: `Module ${moduleNumber} already has ${QUESTIONS_PER_MODULE_AMERICAN} questions (maximum for American exams)`
        });
      }
    }

    // Parse choices if sent as string (multipart form)
    if (typeof choices === 'string') {
      try { choices = JSON.parse(choices); } catch { choices = []; }
    }

    if (!Array.isArray(choices) || choices.length < 2) {
      return res.status(400).json({ success: false, message: 'At least 2 choices required' });
    }

    const correctCount = choices.filter(c => c.isCorrect).length;
    if (correctCount !== 1) {
      return res.status(400).json({ success: false, message: 'Exactly 1 correct answer required' });
    }

    // Upload image if provided
    let imageUrl = null;
    if (req.file) {
      imageUrl = await uploadFile(req.file, 'exam-questions');
    }

    // Get next order index
    const maxOrder = await Question.findOne({ examId: exam._id }).sort('-order').select('order').lean();
    const order = maxOrder ? maxOrder.order + 1 : 0;

    const question = await Question.create({
      examId: exam._id,
      moduleNumber,
      creationMethod,
      questionText: questionText || '',
      imageUrl,
      choices,
      points: exam.type === 'national' ? (parseFloat(points) || 1) : 1,
      order
    });
    
    // Image is already uploaded and its URL is stored in question.imageUrl
    // No need to link it to an ExamImage model since ExamImage does not exist

    res.status(201).json({ success: true, data: question });
  } catch (error) {
    console.error('addQuestion error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * List questions for an exam
 * GET /api/exams/:id/questions?module=1
 */
exports.listQuestions = async (req, res) => {
  try {
    if (!ADMIN_ROLES.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    const filter = { examId: req.params.id };
    if (req.query.module) filter.moduleNumber = parseInt(req.query.module);

    const questions = await Question.find(filter).sort('moduleNumber order').lean();
    res.json({ success: true, data: questions });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Update a question
 * PUT /api/exams/:id/questions/:qid
 */
exports.updateQuestion = async (req, res) => {
  try {
    if (!ADMIN_ROLES.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    const q = await Question.findOne({ _id: req.params.qid, examId: req.params.id });
    if (!q) return res.status(404).json({ success: false, message: 'Question not found' });

    let { questionText, choices, points, moduleNumber } = req.body;

    if (questionText !== undefined) q.questionText = questionText;
    if (moduleNumber) q.moduleNumber = parseInt(moduleNumber);
    if (points !== undefined) q.points = parseFloat(points);

    if (choices) {
      if (typeof choices === 'string') choices = JSON.parse(choices);
      const correctCount = choices.filter(c => c.isCorrect).length;
      if (correctCount !== 1) {
        return res.status(400).json({ success: false, message: 'Exactly 1 correct answer required' });
      }
      q.choices = choices;
    }

    if (req.file) {
      // Delete old image from R2
      if (q.imageUrl && (q.imageUrl.includes('r2.dev') || q.imageUrl.includes('cloudflarestorage'))) {
        await deleteFileFromR2(q.imageUrl);
      }
      q.imageUrl = await uploadFile(req.file, 'exam-questions');
    }

    await q.save();
    res.json({ success: true, data: q });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Delete a question
 * DELETE /api/exams/:id/questions/:qid
 */
exports.deleteQuestion = async (req, res) => {
  try {
    if (!ADMIN_ROLES.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    const q = await Question.findOneAndDelete({ _id: req.params.qid, examId: req.params.id });
    if (q && q.imageUrl && (q.imageUrl.includes('r2.dev') || q.imageUrl.includes('cloudflarestorage'))) {
      await deleteFileFromR2(q.imageUrl);
    }
    res.json({ success: true, message: 'Question deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ──────────────────────────────────────────────────────────
// STUDENT ENDPOINTS
// ──────────────────────────────────────────────────────────

/**
 * List active exams for the student's stage
 * GET /api/exams/student
 */
exports.listExamsForStudent = async (req, res) => {
  try {
    const grade = req.user.grade;
    const exams = await Exam.find({ status: 'active', stage: grade })
      .select('title type stage status createdAt')
      .sort({ createdAt: -1 })
      .lean();

    const examIds = exams.map(e => e._id);

    // Get best results per exam for this student
    const results = await ExamResult.find({
      studentId: req.user.id,
      examId: { $in: examIds }
    }).lean();

    // Map examId → result for O(1) lookup
    const resultMap = {};
    for (const r of results) {
      resultMap[String(r.examId)] = r;
    }

    const enriched = exams.map(e => {
      const result = resultMap[String(e._id)];
      const hasAttempted = !!result;
      const totalAttempts = result?.totalAttempts || 0;
      const canRetake = hasAttempted && totalAttempts < 2; // max 2 attempts per code

      // For score display: American → scaledScore, National → bestScore (points)
      let myBestScore = null;
      if (result) {
        myBestScore = e.type === 'american' ? result.bestScore : result.bestScore;
      }

      return {
        ...e,
        hasAttempted,
        canRetake,
        myBestScore,
        totalAttempts
      };
    });

    res.json({ success: true, data: enriched });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Start an exam attempt (validates code, locks it, returns questions)
 * POST /api/exams/:id/attempt/start
 * Body: { code }
 */
exports.startAttempt = async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ success: false, message: 'Access code is required' });
    }

    // Find the code
    // Case-insensitive search so 'arwa1517', 'ARWA1517', 'Arwa1517' all match
    const accessCode = await ExamAccessCode.findOne({
      code: { $regex: new RegExp(`^${code.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
    });
    if (!accessCode) {
      return res.status(404).json({ success: false, message: 'Invalid access code' });
    }

    if (accessCode.isDisabled) {
      return res.status(403).json({ success: false, message: 'This code has been disabled' });
    }

    // Check if code is already locked to a DIFFERENT exam
    const examId = req.params.id;
    if (accessCode.lockedToExamId && String(accessCode.lockedToExamId) !== String(examId)) {
      return res.status(403).json({
        success: false,
        message: 'This code is locked to a different exam'
      });
    }

    // Check attempt count
    if (accessCode.attemptCount >= 2) {
      return res.status(403).json({
        success: false,
        message: 'Maximum attempts reached for this code (2 attempts allowed)'
      });
    }

    const exam = await Exam.findById(examId);
    if (!exam || exam.status !== 'active') {
      return res.status(404).json({ success: false, message: 'Exam not found or not active' });
    }

    // Lock code to this exam on first use
    const attemptNumber = accessCode.attemptCount + 1;
    await ExamAccessCode.findByIdAndUpdate(accessCode._id, {
      isUsed: true,
      usedAt: accessCode.usedAt || new Date(),
      lockedToExamId: exam._id,
      'usedByStudentId': accessCode.usedByStudentId || req.user.id,
      'usedByStudentName': accessCode.usedByStudentName || `${req.user.firstName} ${req.user.lastName}`,
      $inc: { attemptCount: 1 }
    });

    // Create attempt record
    const attempt = await ExamAttempt.create({
      studentId: req.user.id,
      examId: exam._id,
      accessCodeUsed: accessCode._id,
      attemptNumber,
      status: 'in_progress'
    });

    // Return Module 1 questions (shuffle order for fairness)
    const questions = await Question.find({ examId: exam._id, moduleNumber: 1 })
      .sort('order')
      .select('-choices.isCorrect')  // 🔒 Never send correct answer to client
      .lean();

    res.json({
      success: true,
      data: {
        attemptId: attempt._id,
        examTitle: exam.title,
        examType: exam.type,
        moduleNumber: 1,
        totalModules: exam.type === 'american' ? 2 : 1,
        questions,
        attemptNumber
      }
    });
  } catch (error) {
    console.error('startAttempt error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Retake an exam attempt without providing access code manually
 * POST /api/exams/:id/attempt/retake
 */
exports.retakeAttempt = async (req, res) => {
  try {
    const examId = req.params.id;
    const exam = await Exam.findById(examId);
    if (!exam || exam.status !== 'active') {
      return res.status(404).json({ success: false, message: 'Exam not found or not active' });
    }

    // Find previous result to get access code
    const existingResult = await ExamResult.findOne({
      studentId: req.user.id,
      examId: exam._id
    });

    if (!existingResult || !existingResult.accessCodeId) {
      return res.status(403).json({ success: false, message: 'No previous access code found for this exam' });
    }

    const accessCode = await ExamAccessCode.findById(existingResult.accessCodeId);
    if (!accessCode) {
      return res.status(404).json({ success: false, message: 'Access code not found' });
    }

    if (accessCode.isDisabled) {
      return res.status(403).json({ success: false, message: 'This code has been disabled' });
    }

    // Check attempt count
    if (accessCode.attemptCount >= 2) {
      return res.status(403).json({
        success: false,
        message: 'Maximum attempts reached for this exam (2 attempts allowed)'
      });
    }

    // Increment attempt count and start attempt
    const attemptNumber = accessCode.attemptCount + 1;
    await ExamAccessCode.findByIdAndUpdate(accessCode._id, {
      usedAt: new Date(),
      $inc: { attemptCount: 1 }
    });

    const attempt = await ExamAttempt.create({
      studentId: req.user.id,
      examId: exam._id,
      accessCodeUsed: accessCode._id,
      attemptNumber,
      status: 'in_progress'
    });

    const questions = await Question.find({ examId: exam._id, moduleNumber: 1 })
      .sort('order')
      .select('-choices.isCorrect')
      .lean();

    res.json({
      success: true,
      data: {
        attemptId: attempt._id,
        examTitle: exam.title,
        examType: exam.type,
        moduleNumber: 1,
        totalModules: exam.type === 'american' ? 2 : 1,
        questions,
        attemptNumber
      }
    });
  } catch (error) {
    console.error('retakeAttempt error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
/**
 * Submit a module's answers and get back score + next step
 * POST /api/exams/:id/attempt/:attemptId/submit-module
 * Body: { moduleNumber, answers: [{questionId, selectedChoiceIndex}] }
 */
exports.submitModule = async (req, res) => {
  try {
    let { moduleNumber, answers } = req.body;
    if (!moduleNumber || !answers) {
      return res.status(400).json({ success: false, message: 'moduleNumber and answers required' });
    }

    const attempt = await ExamAttempt.findOne({
      _id: req.params.attemptId,
      studentId: req.user.id,
      examId: req.params.id
    });

    if (!attempt) return res.status(404).json({ success: false, message: 'Attempt not found' });
    if (attempt.status === 'completed') {
      return res.status(400).json({ success: false, message: 'This attempt is already completed' });
    }

    const exam = await Exam.findById(req.params.id);
    const modNum = parseInt(moduleNumber);

    // Fetch questions for this module (with correct answers for grading)
    const questions = await Question.find({ examId: exam._id, moduleNumber: modNum }).lean();

    // Convert frontend format [{questionId, selectedChoiceIndex}] to Map<questionId, choiceId>
    // selectedChoiceIndex is the position in the choices array
    const answersMap = new Map();
    if (Array.isArray(answers)) {
      for (const ans of answers) {
        if (ans.selectedChoiceIndex === null || ans.selectedChoiceIndex === undefined) continue;
        const q = questions.find(q => String(q._id) === String(ans.questionId));
        if (!q) continue;
        const choice = q.choices[ans.selectedChoiceIndex];
        if (choice) {
          answersMap.set(String(ans.questionId), String(choice._id));
        }
      }
    } else if (typeof answers === 'object') {
      // Legacy Map<questionId, choiceId> format — still support it
      for (const [k, v] of Object.entries(answers)) {
        if (v) answersMap.set(k, v);
      }
    }

    let rawScore = calcRawScore(questions, answersMap);
    let nationalPoints = exam.type === 'national' ? calcNationalScore(questions, answersMap) : 0;

    // Store module submission
    attempt.moduleSubmissions.push({
      moduleNumber: modNum,
      answers: Object.fromEntries(answersMap),
      rawScore,
      totalQuestions: questions.length,
      submittedAt: new Date()
    });
    attempt.modulesCompleted = Math.max(attempt.modulesCompleted, modNum);

    const isAmerican = exam.type === 'american';
    const isLastModule = !isAmerican || modNum === 2;

    if (modNum === 1 && !isLastModule) {
      // American exam, module 1 done — ask student to continue or stop
      attempt.status = 'module1_done';
      attempt.rawScore = rawScore;
      await attempt.save();

      return res.json({
        success: true,
        data: {
          moduleNumber: 1,
          rawScore,
          questionsTotal: questions.length,
          isComplete: false,
          nextModule: true,
          message: 'Module 1 complete. You can continue to Module 2 or finish here.'
        }
      });
    }

    // Final module submitted — compute overall score
    let totalRaw = 0;
    for (const sub of attempt.moduleSubmissions) {
      totalRaw += sub.rawScore;
    }

    let totalNational = 0;
    if (exam.type === 'national') {
      // Re-sum national points across all modules
      const allQuestions = await Question.find({ examId: exam._id }).lean();
      const allAnswers = new Map();
      for (const sub of attempt.moduleSubmissions) {
        const subAnswers = sub.answers instanceof Map ? sub.answers : new Map(Object.entries(sub.answers || {}));
        for (const [k, v] of subAnswers) allAnswers.set(k, v);
      }
      totalNational = calcNationalScore(allQuestions, allAnswers);
    }

    const finalScore = isAmerican
      ? scaleAmericanScore(totalRaw, exam.americanScaleTable)
      : totalNational;

    const allQuestionsForMax = await Question.find({ examId: exam._id }).lean();
    const maxScore = isAmerican
      ? 800
      : allQuestionsForMax.reduce((s, q) => s + (q.points || 1), 0);

    const totalQuestions = allQuestionsForMax.length;
    const correctCount = totalRaw; // raw score = number of correct answers

    attempt.rawScore = totalRaw;
    attempt.finalScore = finalScore;
    attempt.maxScore = maxScore;
    attempt.status = 'completed';
    attempt.completedAt = new Date();
    attempt.visibleUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    await attempt.save();

    // Upsert ExamResult — always keep the highest score (best attempt wins)
    const existingResult = await ExamResult.findOne({
      studentId: req.user.id,
      examId: exam._id
    });

    if (!existingResult || finalScore > existingResult.bestScore) {
      await ExamResult.findOneAndUpdate(
        { studentId: req.user.id, examId: exam._id },
        {
          studentId: req.user.id,
          examId: exam._id,
          accessCodeId: attempt.accessCodeUsed,
          bestScore: finalScore,
          maxScore,
          bestAttemptNumber: attempt.attemptNumber,
          totalAttempts: attempt.attemptNumber,
          visibleUntil: attempt.visibleUntil,
          examType: exam.type,
          examTitle: exam.title,
          examStage: exam.stage
        },
        { upsert: true, new: true }
      );
    } else {
      // Update attempt count even if score wasn't better
      await ExamResult.findOneAndUpdate(
        { studentId: req.user.id, examId: exam._id },
        { $set: { totalAttempts: attempt.attemptNumber, visibleUntil: attempt.visibleUntil } }
      );
    }

    res.json({
      success: true,
      data: {
        isComplete: true,
        type: exam.type,
        examTitle: exam.title,
        finalScore,
        maxScore,
        rawScore: totalRaw,
        scaledScore: isAmerican ? finalScore : null,
        totalScore: !isAmerican ? finalScore : null,
        correctCount,
        totalQuestions,
        percentageScore: maxScore > 0 ? (finalScore / maxScore) * 100 : 0,
        modulesCompleted: attempt.modulesCompleted,
        visibleUntil: attempt.visibleUntil
      }
    });
  } catch (error) {
    console.error('submitModule error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Get Module 2 questions (after student decides to continue)
 * POST /api/exams/:id/attempt/:attemptId/continue
 */
exports.continueToModule2 = async (req, res) => {
  try {
    const attempt = await ExamAttempt.findOne({
      _id: req.params.attemptId,
      studentId: req.user.id,
      examId: req.params.id,
      status: 'module1_done'
    });

    if (!attempt) {
      return res.status(404).json({ success: false, message: 'Attempt not found or not in module1_done state' });
    }

    const questions = await Question.find({
      examId: req.params.id,
      moduleNumber: 2
    })
      .sort('order')
      .select('-choices.isCorrect')
      .lean();

    res.json({
      success: true,
      data: {
        moduleNumber: 2,
        questions
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Finish exam after Module 1 (student chose not to continue to Module 2)
 * POST /api/exams/:id/attempt/:attemptId/finish-module1
 */
exports.finishAfterModule1 = async (req, res) => {
  try {
    const attempt = await ExamAttempt.findOne({
      _id: req.params.attemptId,
      studentId: req.user.id,
      examId: req.params.id,
      status: 'module1_done'
    });

    if (!attempt) {
      return res.status(404).json({ success: false, message: 'Attempt not found' });
    }

    const exam = await Exam.findById(req.params.id);

    // Score based on module 1 only; module 2 = all 0s
    const totalRaw = attempt.rawScore;
    const finalScore = scaleAmericanScore(totalRaw, exam.americanScaleTable);
    const maxScore = 800;

    attempt.finalScore = finalScore;
    attempt.maxScore = maxScore;
    attempt.status = 'completed';
    attempt.completedAt = new Date();
    attempt.visibleUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await attempt.save();

    // Upsert best result
    const existingResult = await ExamResult.findOne({
      studentId: req.user.id,
      examId: exam._id,
      accessCodeId: attempt.accessCodeUsed
    });

    if (!existingResult || finalScore > existingResult.bestScore) {
      await ExamResult.findOneAndUpdate(
        { studentId: req.user.id, examId: exam._id, accessCodeId: attempt.accessCodeUsed },
        {
          studentId: req.user.id,
          examId: exam._id,
          accessCodeId: attempt.accessCodeUsed,
          bestScore: finalScore,
          maxScore,
          bestAttemptNumber: attempt.attemptNumber,
          totalAttempts: attempt.attemptNumber,
          visibleUntil: attempt.visibleUntil,
          examType: exam.type,
          examTitle: exam.title,
          examStage: exam.stage
        },
        { upsert: true, new: true }
      );
    } else {
      await ExamResult.findOneAndUpdate(
        { studentId: req.user.id, examId: exam._id },
        { $set: { totalAttempts: attempt.attemptNumber, visibleUntil: attempt.visibleUntil } }
      );
    }

    res.json({
      success: true,
      data: {
        isComplete: true,
        type: exam.type,
        examTitle: exam.title,
        finalScore,
        maxScore,
        rawScore: totalRaw,
        scaledScore: finalScore, // always scaled for american
        totalScore: null,
        correctCount: totalRaw,
        totalQuestions: attempt.moduleSubmissions.reduce((s, m) => s + m.totalQuestions, 0),
        percentageScore: maxScore > 0 ? (finalScore / maxScore) * 100 : 0,
        modulesCompleted: 1,
        visibleUntil: attempt.visibleUntil
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Get student's exam results (visible ones only — within 7 days)
 * GET /api/exams/student/results
 */
exports.getStudentResults = async (req, res) => {
  try {
    const now = new Date();
    const results = await ExamResult.find({
      studentId: req.user.id,
      visibleUntil: { $gte: now }
    })
      .sort({ createdAt: -1 })
      .lean();

    // Normalize for frontend
    const normalized = results.map(r => ({
      _id: r._id,
      examTitle: r.examTitle,
      type: r.examType,
      stage: r.examStage,
      bestScore: r.bestScore,
      maxScore: r.maxScore,
      scaledScore: r.examType === 'american' ? r.bestScore : null,
      totalScore: r.examType === 'national' ? r.bestScore : null,
      percentageScore: r.maxScore > 0 ? (r.bestScore / r.maxScore) * 100 : null,
      totalAttempts: r.totalAttempts,
      completedAt: r.updatedAt || r.createdAt,
      visibleUntil: r.visibleUntil
    }));

    res.json({ success: true, data: normalized });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Admin: get all results for an exam
 * GET /api/exams/:id/results
 */
exports.getExamResults = async (req, res) => {
  try {
    if (!ADMIN_ROLES.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    const results = await ExamResult.find({ examId: req.params.id })
      .populate('studentId', 'firstName lastName grade curriculum')
      .sort({ bestScore: -1 })
      .lean();

    res.json({ success: true, data: results });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
