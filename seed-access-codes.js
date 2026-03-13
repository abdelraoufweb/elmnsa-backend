#!/usr/bin/env node
/**
 * ========================================
 * SEED ACCESS CODES SCRIPT
 * ========================================
 * This script adds ALL original Access Codes to the database
 * Run: node seed-access-codes.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

const AccessCode = require('./models/AccessCode');
const User = require('./models/User');

const CODES = [
  // ========================================
  // STUDENT CODE
  // ========================================
  {
    code: 'student',
    type: 'student',
    role: 'student',
    redirectTo: '/register',
    active: true,
  },

  // ========================================
  // ADMIN CODE
  // ========================================
  {
    code: 'ahmmed/assem/@24681012',
    type: 'admin',
    role: 'admin',
    redirectTo: '/admin',
    active: true,
  },

  // ========================================
  // DEVELOPER CODE
  // ========================================
  {
    code: 'rashwan20081907',
    type: 'developer',
    role: 'developer',
    redirectTo: '/developer',
    active: true,
  },

  // ========================================
  // ASSISTANT CODES (8 accounts)
  // ========================================
  {
    code: 'Saif22@55',
    type: 'assistant',
    role: 'assistant',
    redirectTo: '/assistant',
    active: true,
  },
  {
    code: 'haidy261104',
    type: 'assistant',
    role: 'assistant',
    redirectTo: '/assistant',
    active: true,
  },
  {
    code: 'arwa1517',
    type: 'assistant',
    role: 'assistant',
    redirectTo: '/assistant',
    active: true,
  },
  {
    code: 'youssef#9050',
    type: 'assistant',
    role: 'assistant',
    redirectTo: '/assistant',
    active: true,
  },
  {
    code: 'mohamed9817',
    type: 'assistant',
    role: 'assistant',
    redirectTo: '/assistant',
    active: true,
  },
  {
    code: 'mariam@26',
    type: 'assistant',
    role: 'assistant',
    redirectTo: '/assistant',
    active: true,
  },
  {
    code: 'belal8945',
    type: 'assistant',
    role: 'assistant',
    redirectTo: '/assistant',
    active: true,
  },
  {
    code: 'malak521',
    type: 'assistant',
    role: 'assistant',
    redirectTo: '/assistant',
    active: true,
  },
  {
    code: 'parent',
    type: 'parent',
    role: 'parent',
    redirectTo: '/parent-dashboard',
    active: true,
  },
];

async function seedAccessCodes() {
  try {
    console.log('📊 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/elmnsa');
    console.log('✅ Connected to MongoDB');

    console.log('\n📋 Checking existing codes...');
    const existingCount = await AccessCode.countDocuments();
    console.log(`   Found ${existingCount} existing codes`);

    console.log('\n🗑️  Clearing old codes...');
    await AccessCode.deleteMany({});
    console.log('✅ Cleared');

    console.log('\n💾 Adding access codes...');
    const result = await AccessCode.insertMany(CODES);
    console.log(`✅ Added ${result.length} codes:\n`);

    // Display summary
    const groupedByCodes = {};
    CODES.forEach(code => {
      if (!groupedByCodes[code.roleType]) groupedByCodes[code.roleType] = [];
      groupedByCodes[code.roleType].push(code.code);
    });

    Object.entries(groupedByCodes).forEach(([role, codes]) => {
      console.log(`   🔹 ${role.toUpperCase()} (${codes.length}):`);
      codes.forEach(code => console.log(`      • ${code}`));
    });

    console.log('\n✅ SEEDING COMPLETE!');
    console.log('\n📝 Summary:');
    console.log(`   • Total codes: ${CODES.length}`);
    console.log(`   • Student codes: 1`);
    console.log(`   • Admin codes: 1`);
    console.log(`   • Developer codes: 1`);
    console.log(`   • Assistant codes: 8`);
    console.log(`   • Parent codes: 1`);

    console.log('\n🧪 Testing codes:');
    for (const codeData of CODES) {
      const found = await AccessCode.findOne({ code: codeData.code });
      console.log(`   ✅ ${codeData.code} → ${found ? '✓ Found' : '✗ NOT FOUND'}`);
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ ERROR:', error.message);
    process.exit(1);
  }
}

seedAccessCodes();
