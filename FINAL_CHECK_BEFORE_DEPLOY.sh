#!/bin/bash

# ============================================
# فحص نهائي قبل الرفع
# ============================================

echo "🔍 الفحص النهائي قبل الرفع"
echo "═══════════════════════════════════════"
echo ""

cd /Users/IkramyEltayeb/Downloads/elmnsa/backend

PASS=0
FAIL=0

# 1. فحص vercel.json
echo "1️⃣ فحص vercel.json..."
if grep -q '"PORT"' vercel.json; then
    echo "❌ PORT موجودة في vercel.json (خطأ)"
    ((FAIL++))
else
    echo "✅ PORT محذوفة (صحيح)"
    ((PASS++))
fi

# 2. فحص أن باقي المتغيرات موجودة
if grep -q '"MONGODB_URI"' vercel.json; then
    echo "✅ MONGODB_URI موجودة"
    ((PASS++))
else
    echo "❌ MONGODB_URI مفقودة"
    ((FAIL++))
fi

if grep -q '"JWT_SECRET"' vercel.json; then
    echo "✅ JWT_SECRET موجودة"
    ((PASS++))
else
    echo "❌ JWT_SECRET مفقودة"
    ((FAIL++))
fi

if grep -q '"CORS_ORIGIN"' vercel.json; then
    echo "✅ CORS_ORIGIN موجودة"
    ((PASS++))
else
    echo "❌ CORS_ORIGIN مفقودة"
    ((FAIL++))
fi

# 3. فحص deploy script
echo ""
echo "2️⃣ فحص deploy-to-vercel.sh..."
if grep -q 'vercel --prod --name=elmnsa-backend' deploy-to-vercel.sh; then
    echo "✅ Deploy command صحيح"
    ((PASS++))
else
    echo "❌ Deploy command خطأ"
    ((FAIL++))
fi

# 4. فحص index.js
echo ""
echo "3️⃣ فحص index.js..."
if grep -q 'const PORT = process.env.PORT' index.js; then
    echo "✅ PORT configuration صحيح"
    ((PASS++))
else
    echo "⚠️  PORT configuration لم تتم"
    ((FAIL++))
fi

# 5. فحص package.json
echo ""
echo "4️⃣ فحص package.json..."
if grep -q '"start": "node index.js"' package.json; then
    echo "✅ Start script موجود"
    ((PASS++))
else
    echo "❌ Start script مفقود"
    ((FAIL++))
fi

# النتائج
echo ""
echo "═══════════════════════════════════════"
echo "✅ نجح: $PASS"
echo "❌ فشل: $FAIL"
echo "═══════════════════════════════════════"
echo ""

if [ $FAIL -eq 0 ]; then
    echo "🎊 كل شيء جاهز للرفع!"
    echo ""
    echo "الأمر:"
    echo "bash deploy-to-vercel.sh"
    exit 0
else
    echo "⚠️ توجد بعض المشاكل يجب إصلاحها"
    exit 1
fi
