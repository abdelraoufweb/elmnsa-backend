// ==========================================
// PHONE NUMBER FORMATTER FOR WHATSAPP
// ==========================================
// Normalizes Egyptian phone numbers for WhatsApp sending
// WITHOUT modifying the original data in the database.
//
// Egyptian numbers:
//   Local:  01112966609 (11 digits)
//   Intl:   201112966609 (12 digits)
//   Full:   +201112966609
//
// WhatsApp format: 201112966609@c.us

/**
 * Normalize any phone number to WhatsApp chat ID format
 * @param {string} phone - Raw phone number (any format)
 * @returns {string|null} - WhatsApp chat ID (e.g., "201112966609@c.us") or null if invalid
 */
function toWhatsAppId(phone) {
  if (!phone || typeof phone !== 'string') return null;

  // Strip all non-digit characters (+, spaces, dashes, etc.)
  let digits = phone.replace(/\D/g, '');

  if (!digits || digits.length < 10) return null;

  // Egyptian number detection & normalization
  // Case 1: Starts with "0" (local Egyptian format like 01112966609)
  if (digits.startsWith('0') && digits.length === 11) {
    digits = '20' + digits.substring(1); // 01112966609 → 201112966609
  }
  // Case 2: Starts with "20" already (international without +)
  else if (digits.startsWith('20') && digits.length === 12) {
    // Already correct: 201112966609
  }
  // Case 3: Already has country code from stripping "+"
  // e.g., +201112966609 → 201112966609 (after stripping +)
  // This is handled by the strip above

  // Validate: Egyptian numbers should now be 12 digits starting with 20
  if (digits.startsWith('20') && digits.length !== 12) {
    // Might be a wrong format, but try anyway
    console.warn(`⚠️ [PhoneFormatter] Unusual Egyptian number length: ${digits.length} for ${digits}`);
  }

  return `${digits}@c.us`;
}

/**
 * Normalize phone to display format (for logs/messages)
 * @param {string} phone - Raw phone number
 * @returns {string} - Display format like "+201112966609"
 */
function toDisplayFormat(phone) {
  if (!phone || typeof phone !== 'string') return 'Unknown';

  let digits = phone.replace(/\D/g, '');

  // Egyptian local → international
  if (digits.startsWith('0') && digits.length === 11) {
    digits = '20' + digits.substring(1);
  }

  return `+${digits}`;
}

/**
 * Validate if a phone number can be used for WhatsApp
 * @param {string} phone - Raw phone number
 * @returns {boolean}
 */
function isValidWhatsAppNumber(phone) {
  const id = toWhatsAppId(phone);
  if (!id) return false;

  const digits = id.replace('@c.us', '');
  // Must be at least 10 digits
  return digits.length >= 10 && digits.length <= 15;
}

/**
 * Extract just the digits (international format) from any phone input
 * @param {string} phone 
 * @returns {string}
 */
function toInternationalDigits(phone) {
  if (!phone) return '';
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0') && digits.length === 11) {
    digits = '20' + digits.substring(1);
  }
  return digits;
}

module.exports = {
  toWhatsAppId,
  toDisplayFormat,
  isValidWhatsAppNumber,
  toInternationalDigits
};
