#!/bin/bash

# ==========================================
# VERCEL DEPLOYMENT - ONE COMMAND SETUP
# ==========================================
# This script automates the entire Vercel deployment process

set -e

echo "🚀 VERCEL DEPLOYMENT AUTOMATION"
echo "=================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Check if Vercel CLI is installed
echo -e "${BLUE}[1/5] Checking Vercel CLI...${NC}"
if ! command -v vercel &> /dev/null; then
    echo -e "${YELLOW}Installing Vercel CLI...${NC}"
    npm install -g vercel
    echo -e "${GREEN}✅ Vercel CLI installed${NC}"
else
    VERCEL_VERSION=$(vercel --version)
    echo -e "${GREEN}✅ Vercel CLI found: $VERCEL_VERSION${NC}"
fi
echo ""

# Check if user is logged in
echo -e "${BLUE}[2/5] Checking Vercel authentication...${NC}"
if ! vercel whoami &> /dev/null 2>&1; then
    echo -e "${YELLOW}Please log in to Vercel${NC}"
    vercel login
fi
VERCEL_USER=$(vercel whoami)
echo -e "${GREEN}✅ Logged in as: $VERCEL_USER${NC}"
echo ""

# Navigate to backend
echo -e "${BLUE}[3/5] Navigating to backend...${NC}"
if [ -f "index.js" ]; then
    echo -e "${GREEN}✅ Already in backend directory${NC}"
elif [ -f "backend/index.js" ]; then
    cd backend
    echo -e "${GREEN}✅ Navigated to backend directory${NC}"
else
    echo -e "${RED}❌ Could not find backend/index.js${NC}"
    exit 1
fi
echo ""

# Run pre-deployment checks
echo -e "${BLUE}[4/5] Running pre-deployment checks...${NC}"
if [ -f "pre-deployment-check.sh" ]; then
    bash pre-deployment-check.sh
    if [ $? -ne 0 ]; then
        echo -e "${RED}❌ Pre-deployment checks failed${NC}"
        exit 1
    fi
else
    echo -e "${YELLOW}⚠️  Skipping pre-deployment checks (script not found)${NC}"
fi
echo -e "${GREEN}✅ Pre-deployment checks passed${NC}"
echo ""

# Deploy to Vercel
echo -e "${BLUE}[5/5] Deploying to Vercel...${NC}"
echo -e "${YELLOW}Starting deployment (this may take a few minutes)...${NC}"
echo ""

if vercel --prod --name=elmnsa-backend; then
    echo ""
    echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}✅ DEPLOYMENT SUCCESSFUL!${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
    echo ""
    
    # Get deployment URL
    DEPLOYMENT_URL=$(vercel ls --json 2>/dev/null | grep -o '"url":"[^"]*"' | head -1 | cut -d'"' -f4)
    
    if [ -z "$DEPLOYMENT_URL" ]; then
        DEPLOYMENT_URL="elmnsa-backend.vercel.app"
    fi
    
    echo -e "${BLUE}📊 Deployment Information:${NC}"
    echo -e "  URL: ${GREEN}https://${DEPLOYMENT_URL}${NC}"
    echo -e "  User: ${GREEN}${VERCEL_USER}${NC}"
    echo ""
    
    echo -e "${BLUE}🔧 Next Steps:${NC}"
    echo "1. Add environment variables in Vercel dashboard:"
    echo "   https://vercel.com/dashboard"
    echo ""
    echo "2. Required Environment Variables:"
    echo "   - MONGODB_URI"
    echo "   - JWT_SECRET"
    echo "   - GROQ_API_KEY"
    echo "   - CORS_ORIGIN"
    echo "   - NODE_ENV=production"
    echo "   - BCRYPT_ROUNDS=10"
    echo ""
    echo "3. Test your deployment:"
    echo "   curl https://${DEPLOYMENT_URL}/health"
    echo ""
    echo "4. View logs:"
    echo "   vercel logs"
    echo ""
    echo -e "${GREEN}✅ Your backend is now live!${NC}"
else
    echo -e "${RED}❌ Deployment failed${NC}"
    exit 1
fi
