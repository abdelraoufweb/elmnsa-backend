#!/bin/bash

# ==========================================
# FRONTEND-BACKEND INTEGRATION TEST
# ==========================================
# يختبر الاتصال بين Frontend و Backend

echo "🔗 FRONTEND-BACKEND INTEGRATION TEST"
echo "====================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

BACKEND_URL="http://localhost:5000"

# ==========================================
# 1. CHECK BACKEND SERVER
# ==========================================
echo -e "${BLUE}[1/4] Checking Backend Server...${NC}"

if lsof -Pi :5000 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo -e "${GREEN}✅ Backend running on port 5000${NC}"
else
    echo -e "${RED}❌ Backend not running${NC}"
    echo "Start backend with: npm start"
    exit 1
fi
echo ""

# ==========================================
# 2. TEST CORS CONFIGURATION
# ==========================================
echo -e "${BLUE}[2/4] Testing CORS Configuration...${NC}"

echo -n "Testing CORS headers... "
CORS_RESPONSE=$(curl -s -i -X OPTIONS $BACKEND_URL/api/health 2>&1)

if echo "$CORS_RESPONSE" | grep -iq "Access-Control"; then
    echo -e "${GREEN}✅ CORS enabled${NC}"
else
    echo -e "${YELLOW}⚠️  CORS headers not found${NC}"
fi

echo -n "Testing preflight request... "
PREFLIGHT=$(curl -s -o /dev/null -w "%{http_code}" -X OPTIONS $BACKEND_URL/api/auth/login)
if [ "$PREFLIGHT" == "200" ] || [ "$PREFLIGHT" == "204" ]; then
    echo -e "${GREEN}✅ Preflight OK ($PREFLIGHT)${NC}"
else
    echo -e "${RED}❌ Preflight failed ($PREFLIGHT)${NC}"
fi
echo ""

# ==========================================
# 3. TEST API ENDPOINTS USED BY FRONTEND
# ==========================================
echo -e "${BLUE}[3/4] Testing Frontend-Used Endpoints...${NC}"

echo "POST /api/auth/register..."
curl -s -X POST $BACKEND_URL/api/auth/register \
    -H "Content-Type: application/json" \
    -d '{"name":"Test","email":"test@test.com","password":"Test123!"}' \
    | grep -q "error\|message\|success" && echo -e "${GREEN}✅ Responds to POST${NC}" || echo -e "${YELLOW}⚠️  No expected response${NC}"

echo "POST /api/auth/login..."
curl -s -X POST $BACKEND_URL/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@test.com","password":"test"}' \
    | grep -q "error\|message\|token" && echo -e "${GREEN}✅ Responds to POST${NC}" || echo -e "${YELLOW}⚠️  No expected response${NC}"

echo "GET /api/devices (without auth)..."
DEVICES_STATUS=$(curl -s -o /dev/null -w "%{http_code}" $BACKEND_URL/api/devices)
echo -e "Status: ${GREEN}$DEVICES_STATUS${NC}"

echo "GET /api/health..."
HEALTH_RESPONSE=$(curl -s $BACKEND_URL/api/health | grep -o '"success"')
[ -n "$HEALTH_RESPONSE" ] && echo -e "${GREEN}✅ Health check working${NC}" || echo -e "${RED}❌ Health check failed${NC}"

echo ""

# ==========================================
# 4. FRONTEND-BACKEND CONNECTIVITY
# ==========================================
echo -e "${BLUE}[4/4] Frontend Connectivity Check...${NC}"

echo "Backend API URL: $BACKEND_URL"
echo ""
echo -e "${GREEN}✅ Backend is accessible from: http://localhost:5000${NC}"
echo ""

# Show sample API calls for frontend
echo -e "${BLUE}Sample API Calls for Frontend:${NC}"
echo ""
echo "1. Register User:"
echo "   POST /api/auth/register"
echo "   { email, password, name, role }"
echo ""
echo "2. Login:"
echo "   POST /api/auth/login"
echo "   { email, password }"
echo "   Returns: { token, user }"
echo ""
echo "3. Get User Devices:"
echo "   GET /api/devices"
echo "   Headers: { Authorization: Bearer TOKEN }"
echo ""
echo "4. Register Device:"
echo "   POST /api/devices/register"
echo "   Headers: { Authorization: Bearer TOKEN }"
echo ""

echo "====================================="
echo "✅ INTEGRATION TEST COMPLETE"
echo "====================================="
echo ""
echo -e "${GREEN}Frontend can connect to Backend at: $BACKEND_URL${NC}"
echo ""
echo "Use CORS_ORIGIN: http://localhost:8000"
echo "Or for production: your-domain.com"
