// ==========================================
// AI SERVICE (Groq Integration)
// ==========================================

const axios = require('axios');

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || 'mixtral-8x7b-32768';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

/**
 * Send Message to Groq AI (Streaming)
 */
const sendAIMessage = async (messageText, conversationHistory = []) => {
  try {
    // Build messages array
    const messages = [
      ...conversationHistory,
      {
        role: 'user',
        content: messageText
      }
    ];

    // System prompt for educational context
    const systemPrompt = `You are an educational assistant helping students with their studies. You provide:
- Clear explanations of academic concepts
- Help with homework problems (without just giving answers)
- Study tips and learning strategies
- Encouragement and motivation

Keep responses concise and student-friendly. Use simple language when appropriate.`;

    const response = await axios.post(
      GROQ_API_URL,
      {
        model: GROQ_MODEL,
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          ...messages
        ],
        temperature: 0.7,
        max_tokens: 1000,
        top_p: 1,
        stream: false
      },
      {
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const aiMessage = response.data.choices[0]?.message?.content || 'Unable to generate response';

    return {
      success: true,
      message: aiMessage,
      usage: response.data.usage,
      model: GROQ_MODEL
    };
  } catch (error) {
    console.error('Groq API Error:', error.response?.data || error.message);

    return {
      success: false,
      message: 'I\'m having trouble connecting. Please try again later.',
      error: error.message
    };
  }
};

/**
 * Generate Homework Explanation
 */
const generateHomeworkExplanation = async (topic, problemDescription) => {
  try {
    const prompt = `As an educational assistant, explain this homework problem:

Topic: ${topic}
Problem: ${problemDescription}

Provide:
1. Key concepts needed to solve this
2. Step-by-step approach (without just giving the answer)
3. Tips for solving similar problems
4. Common mistakes to avoid`;

    const response = await axios.post(
      GROQ_API_URL,
      {
        model: GROQ_MODEL,
        messages: [
          {
            role: 'system',
            content: 'You are an educational assistant helping students understand their homework.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 1200
      },
      {
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return {
      success: true,
      explanation: response.data.choices[0]?.message?.content
    };
  } catch (error) {
    console.error('Groq API Error:', error.message);
    return {
      success: false,
      error: 'Could not generate explanation'
    };
  }
};

/**
 * Grade Homework with AI Feedback
 */
const gradeHomeworkWithAI = async (studentResponse, expectedAnswer, topic) => {
  try {
    const prompt = `As an educational grader, evaluate this student response:

Topic: ${topic}
Student Answer: ${studentResponse}
Expected Answer: ${expectedAnswer}

Provide:
1. Grade (A, B, C, D, F)
2. What the student did well
3. What needs improvement
4. Specific feedback for learning
5. A score (0-100)`;

    const response = await axios.post(
      GROQ_API_URL,
      {
        model: GROQ_MODEL,
        messages: [
          {
            role: 'system',
            content: 'You are an educational grader providing constructive feedback.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.5,
        max_tokens: 800
      },
      {
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return {
      success: true,
      feedback: response.data.choices[0]?.message?.content
    };
  } catch (error) {
    console.error('Groq API Error:', error.message);
    return {
      success: false,
      error: 'Could not generate feedback'
    };
  }
};

module.exports = {
  sendAIMessage,
  generateHomeworkExplanation,
  gradeHomeworkWithAI
};
