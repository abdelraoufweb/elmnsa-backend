#!/bin/bash

# ==========================================
# PRE-DEPLOYMENT VERIFICATION CHECKLIST
# ==========================================
# Final checks before deploying to Vercel

echo "🚀 STARTING PRE-DEPLOYMENT VERIFICATION"
echo "========================================"
echo ""

CHECKS_PASSED=0
CHECKS_FAILED=0
CHECKS_WARNING=0

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ==========================================
# 1. CHECK FILE STRUCTURE
# ==========================================
echo -e "${BLUE}[1/10] Checking file structure...${NC}"

FILES_REQUIRED=(
    "index.js"
    "package.json"
    ".env"
    ".env.example"
    ".env.production"
    "Dockerfile"
    ".dockerignore"
    "docker-compose.yml"
    "nginx.conf"
    "build-docker.sh"
)

for file in "${FILES_REQUIRED[@]}"; do
    if [ -f "$file" ]; then
        echo -e "${GREEN}  ✅ $file${NC}"
        ((CHECKS_PASSED++))
    else
        echo -e "${RED}  ❌ MISSING: $file${NC}"
        ((CHECKS_FAILED++))
    fi
done
echo ""

# ==========================================
# 2. CHECK DIRECTORY STRUCTURE
# ==========================================
echo -e "${BLUE}[2/10] Checking directory structure...${NC}"

DIRS_REQUIRED=(
    "controllers"
    "middleware"
    "models"
    "routes"
    "services"
    "config"
    "utils"
    "__tests__"
)

for dir in "${DIRS_REQUIRED[@]}"; do
    if [ -d "$dir" ]; then
        echo -e "${GREEN}  ✅ $dir/${NC}"
        ((CHECKS_PASSED++))
    else
        echo -e "${YELLOW}  ⚠️  OPTIONAL: $dir/${NC}"
        ((CHECKS_WARNING++))
    fi
done
echo ""

# ==========================================
# 3. CHECK NODE.JS AND NPM
# ==========================================
echo -e "${BLUE}[3/10] Checking Node.js and npm...${NC}"

if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo -e "${GREEN}  ✅ Node.js: $NODE_VERSION${NC}"
    ((CHECKS_PASSED++))
else
    echo -e "${RED}  ❌ Node.js NOT found${NC}"
    ((CHECKS_FAILED++))
fi

if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm --version)
    echo -e "${GREEN}  ✅ npm: $NPM_VERSION${NC}"
    ((CHECKS_PASSED++))
else
    echo -e "${RED}  ❌ npm NOT found${NC}"
    ((CHECKS_FAILED++))
fi
echo ""

# ==========================================
# 4. CHECK PACKAGE.JSON
# ==========================================
echo -e "${BLUE}[4/10] Checking package.json...${NC}"

if grep -q '"name"' package.json; then
    echo -e "${GREEN}  ✅ Name field exists${NC}"
    ((CHECKS_PASSED++))
fi

if grep -q '"main".*"index.js"' package.json; then
    echo -e "${GREEN}  ✅ Main entry point is index.js${NC}"
    ((CHECKS_PASSED++))
fi

if grep -q '"start".*"node index.js"' package.json; then
    echo -e "${GREEN}  ✅ Start script configured${NC}"
    ((CHECKS_PASSED++))
else
    echo -e "${RED}  ❌ Start script missing${NC}"
    ((CHECKS_FAILED++))
fi

if grep -q '"engines"' package.json; then
    echo -e "${GREEN}  ✅ Node.js version specified${NC}"
    ((CHECKS_PASSED++))
else
    echo -e "${YELLOW}  ⚠️  Node.js version not specified${NC}"
    ((CHECKS_WARNING++))
fi

if grep -q '"express"' package.json; then
    echo -e "${GREEN}  ✅ Express.js included${NC}"
    ((CHECKS_PASSED++))
fi

if grep -q '"mongoose"' package.json; then
    echo -e "${GREEN}  ✅ Mongoose included${NC}"
    ((CHECKS_PASSED++))
fi

if grep -q 'three\|postprocessing' package.json; then
    echo -e "${RED}  ❌ DEPRECATED: three.js or postprocessing found${NC}"
    ((CHECKS_FAILED++))
else
    echo -e "${GREEN}  ✅ No deprecated libraries${NC}"
    ((CHECKS_PASSED++))
fi
echo ""

# ==========================================
# 5. CHECK ENVIRONMENT CONFIGURATION
# ==========================================
echo -e "${BLUE}[5/10] Checking environment configuration...${NC}"

ENV_VARS_REQUIRED=(
    "PORT"
    "NODE_ENV"
    "MONGODB_URI"
    "JWT_SECRET"
)

for var in "${ENV_VARS_REQUIRED[@]}"; do
    if grep -q "^$var=" .env; then
        echo -e "${GREEN}  ✅ $var configured in .env${NC}"
        ((CHECKS_PASSED++))
    else
        echo -e "${YELLOW}  ⚠️  $var not in .env (check .env.production)${NC}"
        ((CHECKS_WARNING++))
    fi
done
echo ""

# ==========================================
# 6. CHECK DOCKER FILES
# ==========================================
echo -e "${BLUE}[6/10] Checking Docker configuration...${NC}"

if grep -q "FROM node:" Dockerfile; then
    echo -e "${GREEN}  ✅ Dockerfile uses Node.js base image${NC}"
    ((CHECKS_PASSED++))
fi

if grep -q "HEALTHCHECK" Dockerfile; then
    echo -e "${GREEN}  ✅ Health check configured${NC}"
    ((CHECKS_PASSED++))
else
    echo -e "${YELLOW}  ⚠️  No health check in Dockerfile${NC}"
    ((CHECKS_WARNING++))
fi

if grep -q "multi-stage" Dockerfile 2>/dev/null || grep -q "FROM.*AS" Dockerfile; then
    echo -e "${GREEN}  ✅ Multi-stage build configured${NC}"
    ((CHECKS_PASSED++))
fi

if [ -f ".dockerignore" ] && [ -s ".dockerignore" ]; then
    echo -e "${GREEN}  ✅ .dockerignore is configured${NC}"
    ((CHECKS_PASSED++))
fi
echo ""

# ==========================================
# 7. CHECK MAIN SERVER FILE
# ==========================================
echo -e "${BLUE}[7/10] Checking index.js server file...${NC}"

if grep -q "require('express')" index.js; then
    echo -e "${GREEN}  ✅ Express imported${NC}"
    ((CHECKS_PASSED++))
fi

if grep -q "require('mongoose')" index.js; then
    echo -e "${GREEN}  ✅ Mongoose imported${NC}"
    ((CHECKS_PASSED++))
fi

if grep -q "app.listen" index.js || grep -q "server.listen" index.js; then
    echo -e "${GREEN}  ✅ Server listen configured${NC}"
    ((CHECKS_PASSED++))
else
    echo -e "${RED}  ❌ Server listen not found${NC}"
    ((CHECKS_FAILED++))
fi

if grep -q "process.env.PORT" index.js; then
    echo -e "${GREEN}  ✅ PORT from environment variables${NC}"
    ((CHECKS_PASSED++))
fi

if grep -q "/health" index.js; then
    echo -e "${GREEN}  ✅ Health endpoint configured${NC}"
    ((CHECKS_PASSED++))
else
    echo -e "${YELLOW}  ⚠️  No health endpoint${NC}"
    ((CHECKS_WARNING++))
fi
echo ""

# ==========================================
# 8. CHECK ROUTES AND MIDDLEWARE
# ==========================================
echo -e "${BLUE}[8/10] Checking routes and middleware...${NC}"

ROUTES_REQUIRED=(
    "routes/auth.js"
    "routes/devices.js"
    "middleware/auth.js"
    "middleware/deviceValidator.js"
)

for route in "${ROUTES_REQUIRED[@]}"; do
    if [ -f "$route" ]; then
        echo -e "${GREEN}  ✅ $route${NC}"
        ((CHECKS_PASSED++))
    else
        echo -e "${YELLOW}  ⚠️  Optional: $route${NC}"
        ((CHECKS_WARNING++))
    fi
done
echo ""

# ==========================================
# 9. CHECK FOR SECURITY ISSUES
# ==========================================
echo -e "${BLUE}[9/10] Checking security configuration...${NC}"

if grep -q "helmet\|cors" package.json; then
    echo -e "${GREEN}  ✅ Security packages included${NC}"
    ((CHECKS_PASSED++))
fi

if grep -q "process.env.JWT_SECRET" index.js; then
    echo -e "${GREEN}  ✅ JWT Secret from environment${NC}"
    ((CHECKS_PASSED++))
fi

if grep -q ".env" .gitignore 2>/dev/null; then
    echo -e "${GREEN}  ✅ .env files ignored in git${NC}"
    ((CHECKS_PASSED++))
fi

if [ -f ".env.production" ]; then
    echo -e "${GREEN}  ✅ Production environment file exists${NC}"
    ((CHECKS_PASSED++))
fi
echo ""

# ==========================================
# 10. DEPLOYMENT PLATFORM CHECKS
# ==========================================
echo -e "${BLUE}[10/10] Checking Vercel deployment readiness...${NC}"

# Check for vercel.json
if [ ! -f "vercel.json" ]; then
    echo -e "${YELLOW}  ⚠️  No vercel.json found (will use defaults)${NC}"
    ((CHECKS_WARNING++))
else
    echo -e "${GREEN}  ✅ vercel.json configured${NC}"
    ((CHECKS_PASSED++))
fi

# Check if PORT is configurable
if grep -q "process.env.PORT\|PORT.*5000" index.js; then
    echo -e "${GREEN}  ✅ Server uses PORT from environment${NC}"
    ((CHECKS_PASSED++))
fi

# Check for export in package.json
if grep -q '"type".*"module"\|"exports"' package.json; then
    echo -e "${GREEN}  ✅ Module type properly configured${NC}"
    ((CHECKS_PASSED++))
fi

echo ""
echo "========================================"
echo "📊 VERIFICATION SUMMARY"
echo "========================================"
echo -e "${GREEN}✅ Passed: $CHECKS_PASSED${NC}"
echo -e "${YELLOW}⚠️  Warnings: $CHECKS_WARNING${NC}"
echo -e "${RED}❌ Failed: $CHECKS_FAILED${NC}"
echo ""

if [ $CHECKS_FAILED -eq 0 ]; then
    echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}🚀 ALL CHECKS PASSED - READY FOR DEPLOYMENT!${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
    echo ""
    echo "📋 Next steps:"
    echo "1. Create vercel.json (see template below)"
    echo "2. Push to Git: git add . && git commit -m 'Ready for Vercel deployment'"
    echo "3. Deploy: vercel deploy --prod"
    echo "4. Set environment variables in Vercel dashboard"
    echo "5. Monitor deployment at: https://vercel.com/dashboard"
    exit 0
else
    echo -e "${RED}═══════════════════════════════════════════════════${NC}"
    echo -e "${RED}❌ DEPLOYMENT BLOCKED - FIX ERRORS FIRST${NC}"
    echo -e "${RED}═══════════════════════════════════════════════════${NC}"
    exit 1
fi
