require('dotenv').config();
const mongoose = require('mongoose');
const AccessCode = require('./models/AccessCode');

const codes = [
  // Admin
  { code: 'ahmmed/assem/@24681012', type: 'admin', role: 'admin', redirectTo: '/dashboard', active: true },
  
  // Developer
  { code: 'rashwan20081907', type: 'developer', role: 'developer', redirectTo: '/dashboard', active: true },
  
  // Assistants
  { code: 'Saif22@55', type: 'assistant', role: 'assistant', redirectTo: '/dashboard', active: true },
  { code: 'haidy261104', type: 'assistant', role: 'assistant', redirectTo: '/dashboard', active: true },
  { code: 'arwa1517', type: 'assistant', role: 'assistant', redirectTo: '/dashboard', active: true },
  { code: 'youssef#9050', type: 'assistant', role: 'assistant', redirectTo: '/dashboard', active: true },
  { code: 'yassin1590', type: 'assistant', role: 'assistant', redirectTo: '/dashboard', active: true },
  { code: 'mariam@26', type: 'assistant', role: 'assistant', redirectTo: '/dashboard', active: true },
  { code: 'belal8945', type: 'assistant', role: 'assistant', redirectTo: '/dashboard', active: true },
  { code: 'malak521', type: 'assistant', role: 'assistant', redirectTo: '/dashboard', active: true }
];

async function main() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log('✅ Connected to MongoDB');

    // Remove old experimental codes and the removed assistant code
    await AccessCode.deleteMany({ code: { $in: ['admin2026', 'developer2026', 'assistant2026', 'mohamed9817'] } });
    console.log('🗑️  Removed experimental & old codes');

    for (const c of codes) {
      const exists = await AccessCode.findOne({ code: c.code });
      if (exists) {
        console.log(`⏭️  Code ${c.code} already exists - skipping`);
      } else {
        const created = await AccessCode.create(c);
        console.log(`✅ Created ${created.type} code: ${created.code}`);
      }
    }

    const all = await AccessCode.find({}, 'code type role active').lean();
    console.log(`\n📊 Total access codes in DB: ${all.length}`);
    all.forEach(a => console.log(`  - ${a.code} (${a.type}/${a.role}, active:${a.active})`));
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

main();