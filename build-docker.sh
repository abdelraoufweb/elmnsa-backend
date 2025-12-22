#!/bin/bash

# ==========================================
# Docker Build & Deployment Script
# ==========================================
# This script builds and deploys the Docker image

set -e  # Exit on any error

REGISTRY="${REGISTRY:-docker.io}"
IMAGE_NAME="${IMAGE_NAME:-elmnsa-backend}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
BUILD_CONTEXT="${BUILD_CONTEXT:-.}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🔨 Building Docker image...${NC}"
echo "Registry: $REGISTRY"
echo "Image: $IMAGE_NAME:$IMAGE_TAG"
echo "Context: $BUILD_CONTEXT"
echo ""

# Build the image
if docker build \
    --no-cache \
    --tag $REGISTRY/$IMAGE_NAME:$IMAGE_TAG \
    --tag $REGISTRY/$IMAGE_NAME:latest \
    --file $BUILD_CONTEXT/Dockerfile \
    --build-arg NODE_ENV=production \
    $BUILD_CONTEXT; then
    echo -e "${GREEN}✅ Docker build successful!${NC}"
else
    echo -e "${RED}❌ Docker build failed!${NC}"
    exit 1
fi

# Display image info
echo ""
echo -e "${YELLOW}📊 Image Information:${NC}"
docker image inspect $REGISTRY/$IMAGE_NAME:$IMAGE_TAG | grep -E '"Size"|"Created"'

# Get image size
SIZE=$(docker image ls $REGISTRY/$IMAGE_NAME:$IMAGE_TAG --format "{{.Size}}")
echo -e "${GREEN}Image Size: $SIZE${NC}"

# Test the image
echo ""
echo -e "${YELLOW}🧪 Testing Docker image...${NC}"

# Create a temporary container to test
TEMP_CONTAINER=$(docker run -d --rm \
    --env NODE_ENV=test \
    --env MONGODB_URI=mongodb://mongodb/test \
    $REGISTRY/$IMAGE_NAME:$IMAGE_TAG \
    sh -c "echo 'Container started successfully'; sleep 2; exit 0")

# Wait for container to finish
if docker wait $TEMP_CONTAINER >/dev/null 2>&1; then
    echo -e "${GREEN}✅ Docker image test passed!${NC}"
else
    echo -e "${RED}❌ Docker image test failed!${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}✅ Build complete! Image is ready for deployment.${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Push to registry: docker push $REGISTRY/$IMAGE_NAME:$IMAGE_TAG"
echo "2. Deploy: docker run -d -p 5000:5000 $REGISTRY/$IMAGE_NAME:$IMAGE_TAG"
echo "3. Or use docker-compose: docker-compose up -d"
