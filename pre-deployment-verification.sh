#!/bin/bash

# ============================================================================
# PRE-DEPLOYMENT VERIFICATION SCRIPT
# Verifies all backend files without needing Node.js installed locally
# ============================================================================

set -e

RESET='\033[0m'
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'

TESTS_PASSED=0
TESTS_FAILED=0

echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${RESET}"
echo -e "${BLUE}║         PRE-DEPLOYMENT BACKEND VERIFICATION                  ║${RESET}"
echo -e "${BLUE}║         (No Node.js Installation Required)                   ║${RESET}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${RESET}"
echo

# ============================================================================
# TEST 1: Verify All Required Files Exist
# ============================================================================

echo -e "${YELLOW}[1/20] Checking Required Backend Files...${RESET}"

REQUIRED_FILES=(
  "index.js"
  "package.json"
  "vercel.json"
  ".env.production"
  "routes/auth.js"
  "routes/access.js"
  "routes/devices.js"
  "routes/videos.js"
  "routes/students.js"
  "routes/messages.js"
  "routes/themes.js"
  "routes/admin.js"
  "middleware/auth.js"
  "middleware/deviceValidator.js"
  "models/User.js"
  "models/Device.js"
  "models/Product.js"
  "models/Cart.js"
  "models/Message.js"
)

BACKEND_DIR="/Users/IkramyEltayeb/Downloads/elmnsa/backend"

all_files_exist=true
for file in "${REQUIRED_FILES[@]}"; do
  if [ -f "$BACKEND_DIR/$file" ]; then
    echo -e "  ${GREEN}✓${RESET} $file"
    ((TESTS_PASSED++))
  else
    echo -e "  ${RED}✗${RESET} $file (MISSING)"
    ((TESTS_FAILED++))
    all_files_exist=false
  fi
done

if [ "$all_files_exist" = true ]; then
  echo -e "${GREEN}✅ All required files present!${RESET}"
else
  echo -e "${RED}❌ Some files are missing!${RESET}"
fi
echo

# ============================================================================
# TEST 2: Verify package.json Structure
# ============================================================================

echo -e "${YELLOW}[2/20] Verifying package.json Structure...${RESET}"

if grep -q '"name": "elmnsa-backend"' "$BACKEND_DIR/package.json"; then
  echo -e "  ${GREEN}✓${RESET} Package name is correct"
  ((TESTS_PASSED++))
else
  echo -e "  ${RED}✗${RESET} Package name incorrect"
  ((TESTS_FAILED++))
fi

if grep -q '"main": "index.js"' "$BACKEND_DIR/package.json"; then
  echo -e "  ${GREEN}✓${RESET} Main entry point is correct"
  ((TESTS_PASSED++))
else
  echo -e "  ${RED}✗${RESET} Main entry point incorrect"
  ((TESTS_FAILED++))
fi

if grep -q '"engines"' "$BACKEND_DIR/package.json"; then
  echo -e "  ${GREEN}✓${RESET} Node version specified"
  ((TESTS_PASSED++))
else
  echo -e "  ${RED}✗${RESET} Node version not specified"
  ((TESTS_FAILED++))
fi

if grep -q '"start": "node index.js"' "$BACKEND_DIR/package.json"; then
  echo -e "  ${GREEN}✓${RESET} Start script configured"
  ((TESTS_PASSED++))
else
  echo -e "  ${RED}✗${RESET} Start script not configured"
  ((TESTS_FAILED++))
fi
echo

# ============================================================================
# TEST 3: Check for Deprecated Libraries
# ============================================================================

echo -e "${YELLOW}[3/20] Checking for Deprecated Libraries...${RESET}"

if grep -q "three.js\|postprocessing" "$BACKEND_DIR/package.json"; then
  echo -e "  ${RED}✗${RESET} Deprecated libraries found!"
  ((TESTS_FAILED++))
else
  echo -e "  ${GREEN}✓${RESET} No deprecated libraries"
  ((TESTS_PASSED++))
fi

if grep -q "helmet\|express-rate-limit" "$BACKEND_DIR/package.json"; then
  echo -e "  ${GREEN}✓${RESET} Security libraries present"
  ((TESTS_PASSED++))
else
  echo -e "  ${RED}✗${RESET} Security libraries missing"
  ((TESTS_FAILED++))
fi
echo

# ============================================================================
# TEST 4: Verify vercel.json Configuration
# ============================================================================

echo -e "${YELLOW}[4/20] Checking vercel.json Configuration...${RESET}"

if [ -f "$BACKEND_DIR/vercel.json" ]; then
  if grep -q '"version": 2' "$BACKEND_DIR/vercel.json"; then
    echo -e "  ${GREEN}✓${RESET} Vercel version correct"
    ((TESTS_PASSED++))
  else
    echo -e "  ${RED}✗${RESET} Vercel version incorrect"
    ((TESTS_FAILED++))
  fi

  if grep -q '"src": "index.js"' "$BACKEND_DIR/vercel.json"; then
    echo -e "  ${GREEN}✓${RESET} Entry point configured"
    ((TESTS_PASSED++))
  else
    echo -e "  ${RED}✗${RESET} Entry point not configured"
    ((TESTS_FAILED++))
  fi

  if grep -q '"dest": "index.js"' "$BACKEND_DIR/vercel.json"; then
    echo -e "  ${GREEN}✓${RESET} Routes configured"
    ((TESTS_PASSED++))
  else
    echo -e "  ${RED}✗${RESET} Routes not configured"
    ((TESTS_FAILED++))
  fi
else
  echo -e "  ${RED}✗${RESET} vercel.json not found"
  ((TESTS_FAILED+=3))
fi
echo

# ============================================================================
# TEST 5: Check Environment Variables Template
# ============================================================================

echo -e "${YELLOW}[5/20] Checking Environment Variables Template...${RESET}"

if [ -f "$BACKEND_DIR/.env.production" ]; then
  echo -e "  ${GREEN}✓${RESET} .env.production exists"
  ((TESTS_PASSED++))

  if grep -q "MONGODB_URI" "$BACKEND_DIR/.env.production"; then
    echo -e "  ${GREEN}✓${RESET} MONGODB_URI template present"
    ((TESTS_PASSED++))
  else
    echo -e "  ${YELLOW}⚠${RESET} MONGODB_URI template missing"
  fi

  if grep -q "JWT_SECRET" "$BACKEND_DIR/.env.production"; then
    echo -e "  ${GREEN}✓${RESET} JWT_SECRET template present"
    ((TESTS_PASSED++))
  else
    echo -e "  ${YELLOW}⚠${RESET} JWT_SECRET template missing"
  fi
else
  echo -e "  ${RED}✗${RESET} .env.production not found"
  ((TESTS_FAILED++))
fi
echo

# ============================================================================
# TEST 6: Verify index.js Has Health Endpoints
# ============================================================================

echo -e "${YELLOW}[6/20] Checking Health Check Endpoints...${RESET}"

if grep -q "app.get.*'/health'" "$BACKEND_DIR/index.js"; then
  echo -e "  ${GREEN}✓${RESET} /health endpoint found"
  ((TESTS_PASSED++))
else
  echo -e "  ${RED}✗${RESET} /health endpoint missing"
  ((TESTS_FAILED++))
fi

if grep -q "app.get.*'/api/health'" "$BACKEND_DIR/index.js"; then
  echo -e "  ${GREEN}✓${RESET} /api/health endpoint found"
  ((TESTS_PASSED++))
else
  echo -e "  ${RED}✗${RESET} /api/health endpoint missing"
  ((TESTS_FAILED++))
fi
echo

# ============================================================================
# TEST 7: Verify All Routes Are Imported
# ============================================================================

echo -e "${YELLOW}[7/20] Checking Route Imports...${RESET}"

ROUTES=("auth" "access" "devices" "videos" "students" "messages" "themes" "admin")

for route in "${ROUTES[@]}"; do
  if grep -q "require.*routes/$route" "$BACKEND_DIR/index.js"; then
    echo -e "  ${GREEN}✓${RESET} Route: $route imported"
    ((TESTS_PASSED++))
  else
    echo -e "  ${RED}✗${RESET} Route: $route NOT imported"
    ((TESTS_FAILED++))
  fi
done
echo

# ============================================================================
# TEST 8: Check Security Configuration
# ============================================================================

echo -e "${YELLOW}[8/20] Checking Security Configuration...${RESET}"

if grep -q "helmet()" "$BACKEND_DIR/index.js"; then
  echo -e "  ${GREEN}✓${RESET} Helmet security headers enabled"
  ((TESTS_PASSED++))
else
  echo -e "  ${RED}✗${RESET} Helmet security headers not enabled"
  ((TESTS_FAILED++))
fi

if grep -q "cors" "$BACKEND_DIR/index.js"; then
  echo -e "  ${GREEN}✓${RESET} CORS configured"
  ((TESTS_PASSED++))
else
  echo -e "  ${RED}✗${RESET} CORS not configured"
  ((TESTS_FAILED++))
fi

if grep -q "express-rate-limit\|rateLimit" "$BACKEND_DIR/index.js"; then
  echo -e "  ${GREEN}✓${RESET} Rate limiting enabled"
  ((TESTS_PASSED++))
else
  echo -e "  ${YELLOW}⚠${RESET} Rate limiting not configured (optional)"
fi
echo

# ============================================================================
# TEST 9: Check Error Handling
# ============================================================================

echo -e "${YELLOW}[9/20] Checking Error Handling...${RESET}"

if grep -q "process.on.*uncaughtException\|try.*catch" "$BACKEND_DIR/index.js"; then
  echo -e "  ${GREEN}✓${RESET} Error handling configured"
  ((TESTS_PASSED++))
else
  echo -e "  ${YELLOW}⚠${RESET} Error handling could be improved (optional)"
fi

if grep -q "process.on.*unhandledRejection" "$BACKEND_DIR/index.js"; then
  echo -e "  ${GREEN}✓${RESET} Rejection handling configured"
  ((TESTS_PASSED++))
else
  echo -e "  ${YELLOW}⚠${RESET} Rejection handling could be improved (optional)"
fi
echo

# ============================================================================
# TEST 10: Check Dockerfile Configuration
# ============================================================================

echo -e "${YELLOW}[10/20] Checking Dockerfile...${RESET}"

if [ -f "$BACKEND_DIR/Dockerfile" ]; then
  echo -e "  ${GREEN}✓${RESET} Dockerfile exists"
  ((TESTS_PASSED++))

  if grep -q "FROM.*node:.*alpine" "$BACKEND_DIR/Dockerfile"; then
    echo -e "  ${GREEN}✓${RESET} Using Alpine Linux (optimized)"
    ((TESTS_PASSED++))
  else
    echo -e "  ${YELLOW}⚠${RESET} Not using Alpine (size may be larger)"
  fi

  if grep -q "HEALTHCHECK" "$BACKEND_DIR/Dockerfile"; then
    echo -e "  ${GREEN}✓${RESET} Health check configured"
    ((TESTS_PASSED++))
  else
    echo -e "  ${YELLOW}⚠${RESET} Health check not configured"
  fi
else
  echo -e "  ${YELLOW}⚠${RESET} Dockerfile not found (optional for Vercel)"
fi
echo

# ============================================================================
# TEST 11: Verify Middleware Files
# ============================================================================

echo -e "${YELLOW}[11/20] Checking Middleware Files...${RESET}"

if grep -q "module.exports.*authMiddleware" "$BACKEND_DIR/middleware/auth.js"; then
  echo -e "  ${GREEN}✓${RESET} Auth middleware exported"
  ((TESTS_PASSED++))
else
  echo -e "  ${RED}✗${RESET} Auth middleware not exported"
  ((TESTS_FAILED++))
fi

if grep -q "module.exports.*validateDeviceAccess" "$BACKEND_DIR/middleware/deviceValidator.js"; then
  echo -e "  ${GREEN}✓${RESET} Device validator exported"
  ((TESTS_PASSED++))
else
  echo -e "  ${RED}✗${RESET} Device validator not exported"
  ((TESTS_FAILED++))
fi
echo

# ============================================================================
# TEST 12: Verify Model Files
# ============================================================================

echo -e "${YELLOW}[12/20] Checking Model Files...${RESET}"

MODELS=("User" "Device" "Product" "Cart" "Message")

for model in "${MODELS[@]}"; do
  if grep -q "mongoose.model\|module.exports" "$BACKEND_DIR/models/${model}.js" 2>/dev/null; then
    echo -e "  ${GREEN}✓${RESET} $model model defined"
    ((TESTS_PASSED++))
  else
    echo -e "  ${YELLOW}⚠${RESET} $model model may need verification"
  fi
done
echo

# ============================================================================
# TEST 13: Check Route Endpoint Patterns
# ============================================================================

echo -e "${YELLOW}[13/20] Checking Route Endpoints...${RESET}"

if grep -q "router.post.*register\|router.post.*login" "$BACKEND_DIR/routes/auth.js"; then
  echo -e "  ${GREEN}✓${RESET} Auth endpoints configured"
  ((TESTS_PASSED++))
else
  echo -e "  ${RED}✗${RESET} Auth endpoints not configured"
  ((TESTS_FAILED++))
fi

if grep -q "router.*device" "$BACKEND_DIR/routes/devices.js"; then
  echo -e "  ${GREEN}✓${RESET} Device endpoints configured"
  ((TESTS_PASSED++))
else
  echo -e "  ${RED}✗${RESET} Device endpoints not configured"
  ((TESTS_FAILED++))
fi
echo

# ============================================================================
# TEST 14: Verify PORT Configuration
# ============================================================================

echo -e "${YELLOW}[14/20] Checking PORT Configuration...${RESET}"

if grep -q "process.env.PORT\|PORT.*5000\|PORT.*8000" "$BACKEND_DIR/index.js"; then
  echo -e "  ${GREEN}✓${RESET} PORT configuration found"
  ((TESTS_PASSED++))
else
  echo -e "  ${YELLOW}⚠${RESET} PORT configuration unclear"
fi

if grep -q "app.listen\|server.listen" "$BACKEND_DIR/index.js"; then
  echo -e "  ${GREEN}✓${RESET} Server listening configured"
  ((TESTS_PASSED++))
else
  echo -e "  ${RED}✗${RESET} Server listening not configured"
  ((TESTS_FAILED++))
fi
echo

# ============================================================================
# TEST 15: Check Database Connection Logic
# ============================================================================

echo -e "${YELLOW}[15/20] Checking Database Connection...${RESET}"

if grep -q "mongoose.connect\|mongodb" "$BACKEND_DIR/index.js"; then
  echo -e "  ${GREEN}✓${RESET} MongoDB connection logic found"
  ((TESTS_PASSED++))
else
  echo -e "  ${RED}✗${RESET} MongoDB connection logic missing"
  ((TESTS_FAILED++))
fi
echo

# ============================================================================
# TEST 16: Check for Common 404 Prevention
# ============================================================================

echo -e "${YELLOW}[16/20] Checking 404 Error Prevention...${RESET}"

if grep -q "app.use.*static\|app.get.*\*" "$BACKEND_DIR/index.js"; then
  echo -e "  ${GREEN}✓${RESET} Wildcard route handler configured"
  ((TESTS_PASSED++))
else
  echo -e "  ${YELLOW}⚠${RESET} No wildcard route handler (may cause 404s)"
fi

if grep -q "404\|not found" "$BACKEND_DIR/index.js"; then
  echo -e "  ${GREEN}✓${RESET} 404 error handling present"
  ((TESTS_PASSED++))
else
  echo -e "  ${YELLOW}⚠${RESET} 404 error handling not explicit"
fi
echo

# ============================================================================
# TEST 17: Verify No Hardcoded Secrets
# ============================================================================

echo -e "${YELLOW}[17/20] Checking for Hardcoded Secrets...${RESET}"

SECRETS_FOUND=false

if grep -r "mongodb+srv://\|mongodb://.*:" "$BACKEND_DIR" 2>/dev/null | grep -v ".env\|vercel.json"; then
  echo -e "  ${RED}✗${RESET} Hardcoded MongoDB URI found!"
  ((TESTS_FAILED++))
  SECRETS_FOUND=true
fi

if grep -r "JWT_SECRET.*=.*['\"]" "$BACKEND_DIR/*.js" 2>/dev/null | grep -v ".env\|process.env"; then
  echo -e "  ${RED}✗${RESET} Hardcoded JWT_SECRET found!"
  ((TESTS_FAILED++))
  SECRETS_FOUND=true
fi

if [ "$SECRETS_FOUND" = false ]; then
  echo -e "  ${GREEN}✓${RESET} No hardcoded secrets found"
  ((TESTS_PASSED++))
fi
echo

# ============================================================================
# TEST 18: Check File Permissions
# ============================================================================

echo -e "${YELLOW}[18/20] Checking File Permissions...${RESET}"

if [ -r "$BACKEND_DIR/index.js" ] && [ -r "$BACKEND_DIR/package.json" ]; then
  echo -e "  ${GREEN}✓${RESET} Main files are readable"
  ((TESTS_PASSED++))
else
  echo -e "  ${RED}✗${RESET} Main files have permission issues"
  ((TESTS_FAILED++))
fi
echo

# ============================================================================
# TEST 19: Verify .gitignore Configuration
# ============================================================================

echo -e "${YELLOW}[19/20] Checking .gitignore...${RESET}"

if [ -f "$BACKEND_DIR/.gitignore" ]; then
  if grep -q "node_modules\|.env\|*.log" "$BACKEND_DIR/.gitignore"; then
    echo -e "  ${GREEN}✓${RESET} .gitignore properly configured"
    ((TESTS_PASSED++))
  else
    echo -e "  ${YELLOW}⚠${RESET} .gitignore may be incomplete"
  fi
else
  echo -e "  ${YELLOW}⚠${RESET} .gitignore not found (optional)"
fi
echo

# ============================================================================
# TEST 20: Summary and Overall Status
# ============================================================================

echo -e "${YELLOW}[20/20] Final Status Report...${RESET}"

TOTAL_TESTS=$((TESTS_PASSED + TESTS_FAILED))
PASS_PERCENTAGE=$((TESTS_PASSED * 100 / TOTAL_TESTS))

echo
echo -e "${BLUE}════════════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}VERIFICATION RESULTS${RESET}"
echo -e "${BLUE}════════════════════════════════════════════════════════════${RESET}"
echo -e "Tests Passed:   ${GREEN}${TESTS_PASSED}${RESET}"
echo -e "Tests Failed:   ${RED}${TESTS_FAILED}${RESET}"
echo -e "Total Tests:    ${BOLD}${TOTAL_TESTS}${RESET}"
echo -e "Pass Rate:      ${PASS_PERCENTAGE}%"
echo -e "${BLUE}════════════════════════════════════════════════════════════${RESET}"
echo

# ============================================================================
# FINAL VERDICT
# ============================================================================

if [ $TESTS_FAILED -eq 0 ]; then
  echo -e "${GREEN}${BOLD}✅ ALL VERIFICATIONS PASSED!${RESET}"
  echo -e "${GREEN}Your backend is ready for deployment to Vercel!${RESET}"
  echo
  echo -e "${YELLOW}Next Steps:${RESET}"
  echo -e "  1. Verify environment variables are ready"
  echo -e "  2. Run: ${BOLD}bash DEPLOY_BACKEND_NOW.sh${RESET}"
  echo -e "  3. Your backend will be LIVE! 🚀"
  echo
  exit 0
elif [ $TESTS_FAILED -le 3 ]; then
  echo -e "${YELLOW}${BOLD}⚠️  MINOR ISSUES FOUND${RESET}"
  echo -e "${YELLOW}Backend is mostly ready, but review the warnings above.${RESET}"
  echo
  exit 0
else
  echo -e "${RED}${BOLD}❌ CRITICAL ISSUES FOUND${RESET}"
  echo -e "${RED}Please fix the failed tests before deployment.${RESET}"
  echo
  exit 1
fi
