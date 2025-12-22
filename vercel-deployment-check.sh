#!/bin/bash

# ==========================================
# VERCEL DEPLOYMENT VERIFICATION
# ==========================================
# يفحص قبل و بعد الـ deployment على Vercel

echo "✅ VERCEL DEPLOYMENT VERIFICATION"
echo "===================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

CHECKS_PASSED=0
CHECKS_FAILED=0

# ==========================================
# 1. PRE-DEPLOYMENT CHECKS
# ==========================================
echo -e "${BLUE}PRE-DEPLOYMENT CHECKS${NC}"
echo "----------------------"

# Check vercel.json
echo -n "✓ vercel.json exists... "
if [ -f "vercel.json" ]; then
    echo -e "${GREEN}YES${NC}"
    ((CHECKS_PASSED++))
else
    echo -e "${RED}NO${NC}"
    ((CHECKS_FAILED++))
fi

# Check package.json
echo -n "✓ package.json valid... "
if grep -q '"name"' package.json && grep -q '"start"' package.json; then
    echo -e "${GREEN}YES${NC}"
    ((CHECKS_PASSED++))
else
    echo -e "${RED}NO${NC}"
    ((CHECKS_FAILED++))
fi

# Check .env.production
echo -n "✓ .env.production exists... "
if [ -f ".env.production" ]; then
    echo -e "${GREEN}YES${NC}"
    ((CHECKS_PASSED++))
else
    echo -e "${RED}NO${NC}"
    ((CHECKS_FAILED++))
fi

# Check Dockerfile
echo -n "✓ Dockerfile exists... "
if [ -f "Dockerfile" ]; then
    echo -e "${GREEN}YES${NC}"
    ((CHECKS_PASSED++))
else
    echo -e "${RED}NO${NC}"
    ((CHECKS_FAILED++))
fi

# Check main entry point
echo -n "✓ index.js exists... "
if [ -f "index.js" ]; then
    echo -e "${GREEN}YES${NC}"
    ((CHECKS_PASSED++))
else
    echo -e "${RED}NO${NC}"
    ((CHECKS_FAILED++))
fi

# Check health endpoints in index.js
echo -n "✓ Health endpoints configured... "
if grep -q "/health" index.js; then
    echo -e "${GREEN}YES${NC}"
    ((CHECKS_PASSED++))
else
    echo -e "${RED}NO${NC}"
    ((CHECKS_FAILED++))
fi

# Check PORT usage
echo -n "✓ PORT from environment... "
if grep -q "process.env.PORT" index.js; then
    echo -e "${GREEN}YES${NC}"
    ((CHECKS_PASSED++))
else
    echo -e "${RED}NO${NC}"
    ((CHECKS_FAILED++))
fi

# Check for deprecated libraries
echo -n "✓ No deprecated libraries... "
if ! grep -q "three\|postprocessing" package.json; then
    echo -e "${GREEN}YES${NC}"
    ((CHECKS_PASSED++))
else
    echo -e "${RED}FOUND${NC}"
    ((CHECKS_FAILED++))
fi

# Check routes
echo -n "✓ Routes configured... "
if grep -q "/api/auth\|/api/devices" index.js; then
    echo -e "${GREEN}YES${NC}"
    ((CHECKS_PASSED++))
else
    echo -e "${RED}NO${NC}"
    ((CHECKS_FAILED++))
fi

# Check middleware
echo -n "✓ Middleware configured... "
if grep -q "cors\|helmet" index.js; then
    echo -e "${GREEN}YES${NC}"
    ((CHECKS_PASSED++))
else
    echo -e "${RED}NO${NC}"
    ((CHECKS_FAILED++))
fi

echo ""

# ==========================================
# 2. ENVIRONMENT VARIABLES
# ==========================================
echo -e "${BLUE}REQUIRED ENVIRONMENT VARIABLES${NC}"
echo "------------------------------"

REQUIRED_VARS=(
    "PORT"
    "NODE_ENV"
    "MONGODB_URI"
    "JWT_SECRET"
)

for var in "${REQUIRED_VARS[@]}"; do
    echo -n "✓ $var... "
    if grep -q "^$var=" .env.production 2>/dev/null; then
        echo -e "${GREEN}SET${NC}"
        ((CHECKS_PASSED++))
    else
        echo -e "${YELLOW}TEMPLATE (set in Vercel)${NC}"
    fi
done

echo ""

# ==========================================
# 3. DEPLOYMENT READINESS
# ==========================================
echo -e "${BLUE}DEPLOYMENT READINESS${NC}"
echo "-------------------"

echo -n "✓ Node.js >= 18... "
if [ -f "package.json" ] && grep -q '"node".*">=18' package.json; then
    echo -e "${GREEN}YES${NC}"
    ((CHECKS_PASSED++))
else
    echo -e "${YELLOW}CHECK MANUALLY${NC}"
fi

echo -n "✓ npm dependencies... "
if [ -f "package.json" ] && [ -d "node_modules" ]; then
    echo -e "${GREEN}INSTALLED${NC}"
    ((CHECKS_PASSED++))
elif [ -f "package.json" ]; then
    echo -e "${YELLOW}RUN npm install${NC}"
fi

echo -n "✓ Git configured... "
if [ -d ".git" ]; then
    echo -e "${GREEN}YES${NC}"
    ((CHECKS_PASSED++))
else
    echo -e "${YELLOW}NOT REQUIRED (can deploy without git)${NC}"
fi

echo -n "✓ .gitignore includes .env... "
if [ -f ".gitignore" ] && grep -q ".env" .gitignore; then
    echo -e "${GREEN}YES${NC}"
    ((CHECKS_PASSED++))
else
    echo -e "${YELLOW}ADD TO .gitignore${NC}"
fi

echo ""

# ==========================================
# 4. SUMMARY & NEXT STEPS
# ==========================================
echo "===================================="
echo "📊 VERIFICATION SUMMARY"
echo "===================================="
echo -e "${GREEN}Checks Passed: $CHECKS_PASSED${NC}"
echo -e "${RED}Checks Failed: $CHECKS_FAILED${NC}"
echo ""

if [ $CHECKS_FAILED -eq 0 ]; then
    echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}✅ READY FOR VERCEL DEPLOYMENT!${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
    echo ""
    echo "🚀 NEXT STEPS:"
    echo ""
    echo "1. Install Vercel CLI:"
    echo "   npm install -g vercel"
    echo ""
    echo "2. Login to Vercel:"
    echo "   vercel login"
    echo ""
    echo "3. Deploy to production:"
    echo "   vercel --prod"
    echo ""
    echo "4. Add environment variables in Vercel Dashboard:"
    echo "   https://vercel.com/dashboard"
    echo "   Settings > Environment Variables"
    echo ""
    echo "5. Re-deploy to apply environment variables:"
    echo "   vercel --prod"
    echo ""
    echo "6. Test deployment:"
    echo "   curl https://your-project.vercel.app/health"
    echo ""
    echo "7. Connect frontend:"
    echo "   Set CORS_ORIGIN in Vercel environment variables"
    echo ""
else
    echo -e "${RED}❌ FIX ERRORS BEFORE DEPLOYMENT${NC}"
    exit 1
fi
