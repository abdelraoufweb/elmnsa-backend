#!/bin/bash

# ============================================
# رفع سريع على Vercel
# ============================================

cd /Users/IkramyEltayeb/Downloads/elmnsa/backend

echo ""
echo "🚀 بدء الرفع على Vercel"
echo "=================================="
echo ""

# تثبيت Vercel
if ! command -v vercel &> /dev/null; then
    echo "📦 تثبيت Vercel CLI..."
    npm install -g vercel
fi

# تسجيل الدخول
echo "🔐 تسجيل الدخول..."
vercel login

# الرفع
echo ""
echo "📤 الرفع على Vercel..."
vercel --prod --name=elmnsa-backend

echo ""
echo "✅ تم الرفع بنجاح!"
echo ""
echo "الخطوة التالية:"
echo "1. اذهب إلى: https://vercel.com/dashboard"
echo "2. اختر: elmnsa-backend"
echo "3. Settings → Environment Variables"
echo "4. أضف المتغيرات (انظر VERCEL_DIRECT_UPLOAD_GUIDE.md)"
echo "5. Save → انتظر إعادة النشر"
echo ""
