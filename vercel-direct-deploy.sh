#!/bin/bash

# ============================================
# رفع مباشر على Vercel بدون GitHub
# ============================================

echo ""
echo "🚀 رفع مباشر على Vercel"
echo "=================================="
echo ""

# Check Vercel CLI
echo "1️⃣ فحص Vercel CLI..."
if ! command -v vercel &> /dev/null; then
    echo "📦 تثبيت Vercel CLI..."
    npm install -g vercel
fi
echo "✅ Vercel CLI جاهز"
echo ""

# Login
echo "2️⃣ التحقق من البيانات..."
if ! vercel whoami &> /dev/null 2>&1; then
    echo "⏳ برجاء تسجيل الدخول في Vercel..."
    vercel login
fi
echo "✅ تم تسجيل الدخول"
echo ""

# Create .vercelignore
echo "3️⃣ إنشاء .vercelignore..."
cat > .vercelignore << 'EOF'
node_modules
.git
.env
.env.local
test
__tests__
*.log
.DS_Store
README.md
*.md
.next
dist
EOF
echo "✅ تم إنشاء .vercelignore"
echo ""

# Deploy
echo "4️⃣ الرفع على Vercel..."
echo "⏳ الرجاء الانتظار..."
echo ""

vercel --prod --name=elmnsa-backend

if [ $? -eq 0 ]; then
    echo ""
    echo "════════════════════════════════════════"
    echo "✅ تم الرفع بنجاح!"
    echo "════════════════════════════════════════"
    echo ""
    echo "📝 الخطوة التالية:"
    echo ""
    echo "اذهب إلى Vercel Dashboard:"
    echo "https://vercel.com/dashboard"
    echo ""
    echo "اختر المشروع الجديد: elmnsa-backend"
    echo ""
    echo "Settings → Environment Variables"
    echo ""
    echo "أضف هذه المتغيرات:"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "MONGODB_URI:"
    echo "mongodb+srv://abdelraouf:abdelraoufweb0100@abdelraouf.c176sqk.mongodb.net/elmnsa?retryWrites=true&w=majority"
    echo ""
    echo "JWT_SECRET:"
    echo "your_super_secret_jwt_key_change_this_in_production_min_32_chars_very_long_and_random_string_here"
    echo ""
    echo "GROQ_API_KEY:"
    echo "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"
    echo ""
    echo "CORS_ORIGIN:"
    echo "https://your-frontend-domain.com"
    echo ""
    echo "NODE_ENV:"
    echo "production"
    echo ""
    echo "BCRYPT_ROUNDS:"
    echo "10"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "✅ حفظ وانتظر إعادة النشر التلقائية"
    echo ""
else
    echo "❌ فشل الرفع"
    exit 1
fi
