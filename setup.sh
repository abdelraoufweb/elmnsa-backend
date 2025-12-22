#!/bin/bash

# ==========================================
# Elmnsa Backend Setup Script
# ==========================================

echo "
╔════════════════════════════════════════════════════════╗
║        🎓 ELMNSA BACKEND SETUP SCRIPT 🎓              ║
╚════════════════════════════════════════════════════════╝
"

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js v14+"
    exit 1
fi

echo "✅ Node.js version: $(node --version)"

# Check npm
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed"
    exit 1
fi

echo "✅ npm version: $(npm --version)"

# Navigate to backend directory
cd "$(dirname "$0")" || exit

# Check if .env exists
if [ ! -f .env ]; then
    echo "⚠️  .env file not found!"
    echo "📝 Creating .env from template..."
    cat > .env << 'EOF'
PORT=5000
NODE_ENV=development
SERVER_URL=http://localhost:5000

MONGODB_URI=mongodb://localhost:27017/elmnsa

JWT_SECRET=your_super_secret_jwt_key_change_this_in_production_min_32_chars
JWT_EXPIRE=7d

GROQ_API_KEY=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
GROQ_MODEL=mixtral-8x7b-32768

FRONTEND_URL=http://localhost:8000

MAX_FILE_SIZE=52428800
UPLOAD_DIR=./uploads

DEVELOPER_CODE=rashwan20081907
ADMIN_CODE=ahmed/assem/@24681012
EOF
    echo "✅ .env created. Please update values if needed."
fi

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ npm install failed"
    exit 1
fi

echo ""
echo "✅ Installation complete!"
echo ""
echo "════════════════════════════════════════════════════════"
echo "📋 NEXT STEPS:"
echo "════════════════════════════════════════════════════════"
echo ""
echo "1. Ensure MongoDB is running:"
echo "   brew services start mongodb-community"
echo ""
echo "2. Start the backend:"
echo "   npm run dev"
echo ""
echo "3. Verify server is running:"
echo "   curl http://localhost:5000/health"
echo ""
echo "4. Check frontend connection:"
echo "   Update frontend to http://localhost:5000"
echo ""
echo "════════════════════════════════════════════════════════"
echo "📚 Documentation:"
echo "════════════════════════════════════════════════════════"
echo ""
echo "• API Docs: See API_DOCUMENTATION.md"
echo "• Integration: See INTEGRATION_GUIDE.md"
echo "• Setup Info: See README.md"
echo ""
echo "✅ Setup complete! Ready to start developing."
