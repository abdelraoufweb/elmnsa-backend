// ==========================================
// CAPTCHA VERIFICATION MIDDLEWARE
// Supports: Cloudflare Turnstile & Google reCAPTCHA v2/v3
// ==========================================
// 
// Setup:
//   1. Cloudflare Turnstile:
//      CAPTCHA_PROVIDER=turnstile
//      CAPTCHA_SECRET=<your-turnstile-secret-key>
//
//   2. Google reCAPTCHA v2/v3:
//      CAPTCHA_PROVIDER=recaptcha
//      CAPTCHA_SECRET=<your-recaptcha-secret>
//      CAPTCHA_SCORE_THRESHOLD=0.5   (reCAPTCHA v3 only, default 0.5)
//
// Frontend sends captcha token in request body as: { captchaToken: "..." }
// If CAPTCHA_SECRET is not set, middleware is bypassed (dev/staging safe).
// ==========================================

const https = require('https');

const TURNSTILE_VERIFY_URL  = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const RECAPTCHA_VERIFY_URL  = 'https://www.google.com/recaptcha/api/siteverify';

/**
 * Verify a Cloudflare Turnstile token
 */
const verifyTurnstile = (token, ip, secret) => {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ secret, response: token, remoteip: ip });
    const url  = new URL(TURNSTILE_VERIFY_URL);

    const req = https.request({
      hostname: url.hostname,
      path:     url.pathname,
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.success === true);
        } catch { resolve(false); }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
};

/**
 * Verify a Google reCAPTCHA token (v2 or v3)
 */
const verifyRecaptcha = (token, ip, secret) => {
  const threshold = parseFloat(process.env.CAPTCHA_SCORE_THRESHOLD || '0.5');
  return new Promise((resolve, reject) => {
    const params = `secret=${encodeURIComponent(secret)}&response=${encodeURIComponent(token)}&remoteip=${encodeURIComponent(ip)}`;
    const url    = new URL(RECAPTCHA_VERIFY_URL);

    const req = https.request({
      hostname: url.hostname,
      path:     `${url.pathname}?${params}`,
      method:   'POST',
      headers:  { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': 0 }
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          // v3 has a score field; v2 does not
          if (parsed.score !== undefined) {
            resolve(parsed.success === true && parsed.score >= threshold);
          } else {
            resolve(parsed.success === true);
          }
        } catch { resolve(false); }
      });
    });

    req.on('error', reject);
    req.end();
  });
};

/**
 * CAPTCHA verification middleware
 * - Skipped if CAPTCHA_SECRET is not set (safe for development)
 * - Reads token from req.body.captchaToken
 */
const verifyCaptcha = async (req, res, next) => {
  const secret   = process.env.CAPTCHA_SECRET;
  const provider = (process.env.CAPTCHA_PROVIDER || 'turnstile').toLowerCase();

  // ✅ Bypass if CAPTCHA not configured (dev / staging)
  if (!secret) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('⚠️ [CAPTCHA] CAPTCHA_SECRET not set — bypassing CAPTCHA check');
    }
    return next();
  }

  const token = req.body?.captchaToken || req.body?.['cf-turnstile-response'] || req.body?.['g-recaptcha-response'];

  if (!token || typeof token !== 'string' || !token.trim()) {
    return res.status(400).json({
      success: false,
      message: 'CAPTCHA verification required',
      error:   'CAPTCHA_MISSING'
    });
  }

  const forwarded = req.headers['x-forwarded-for'];
  const ip = (forwarded && forwarded.split(',')[0].trim()) || req.ip || '';

  try {
    let valid = false;

    if (provider === 'turnstile') {
      valid = await verifyTurnstile(token.trim(), ip, secret);
    } else if (provider === 'recaptcha') {
      valid = await verifyRecaptcha(token.trim(), ip, secret);
    } else {
      console.error(`[CAPTCHA] Unknown provider: ${provider}. Use "turnstile" or "recaptcha".`);
      // Unknown provider — fail open only in non-production
      if (process.env.NODE_ENV !== 'production') return next();
      return res.status(500).json({ success: false, message: 'CAPTCHA configuration error' });
    }

    if (!valid) {
      console.warn(`⚠️ [CAPTCHA] Failed verification from IP: ${ip}`);
      return res.status(400).json({
        success: false,
        message: 'CAPTCHA verification failed. Please try again.',
        error:   'CAPTCHA_INVALID'
      });
    }

    next();
  } catch (err) {
    console.error('[CAPTCHA] Verification error:', err.message);
    // Fail open in development, fail closed in production
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[CAPTCHA] Failing open due to verification error (non-production)');
      return next();
    }
    return res.status(503).json({
      success: false,
      message: 'CAPTCHA service unavailable. Please try again.',
      error:   'CAPTCHA_ERROR'
    });
  }
};

module.exports = { verifyCaptcha };
