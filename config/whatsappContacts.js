// ==========================================
// WHATSAPP CONTACT REGISTRY
// ==========================================
// Reads admin/assistant phone numbers from environment variables.
// Set WHATSAPP_ADMIN_PHONES and WHATSAPP_ASSISTANT_PHONES as JSON arrays.
//
// Example .env:
//   WHATSAPP_ADMIN_PHONES=[{"name":"Admin 1","phone":"+201112966609","role":"admin"}]
//   WHATSAPP_ASSISTANT_PHONES=[{"name":"Mariam","phone":"+201061871136","role":"assistant"}]

function parseEnvArray(key) {
  try {
    const val = process.env[key];
    if (val) return JSON.parse(val);
  } catch (e) {
    console.warn(`[whatsappContacts] Failed to parse ${key}, using empty list`);
  }
  return [];
}

const ADMIN_PHONES = parseEnvArray('WHATSAPP_ADMIN_PHONES');
const ASSISTANT_PHONES = parseEnvArray('WHATSAPP_ASSISTANT_PHONES');

/**
 * Get all staff phones (admins + assistants)
 * @returns {Array} Array of { name, phone, role }
 */
function getAllStaffPhones() {
  return [...ADMIN_PHONES, ...ASSISTANT_PHONES];
}

/**
 * Get only admin phones
 * @returns {Array}
 */
function getAdminPhones() {
  return ADMIN_PHONES;
}

/**
 * Get only assistant phones
 * @returns {Array}
 */
function getAssistantPhones() {
  return ASSISTANT_PHONES;
}

module.exports = {
  ADMIN_PHONES,
  ASSISTANT_PHONES,
  getAllStaffPhones,
  getAdminPhones,
  getAssistantPhones
};
