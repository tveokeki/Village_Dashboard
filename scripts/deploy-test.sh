#!/bin/bash
# Suan Ake Deployment Smoke Test and Health Check Script
# This script verifies both UAT and Production containers after build/deploy.

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CLEAR='\033[0m'

echo -e "${YELLOW}====================================================${CLEAR}"
echo -e "${YELLOW}🚀 STARTING SUAN AKE DEPLOYMENT SMOKE TEST & SANITY CHECK${CLEAR}"
echo -e "${YELLOW}====================================================${CLEAR}"

# 1. Check if UAT container is running and healthy
echo -e "\n🔍 Checking UAT container..."
if [ "$(docker ps -q -f name=suan-eak-web-uat)" ]; then
    echo -e "${GREEN}✔ UAT container (suan-eak-web-uat) is running.${CLEAR}"
    
    # Check UAT Env Variables (Ensure DB is slip_processing_uat)
    DB_NAME_UAT=$(docker inspect suan-eak-web-uat | jq -r '.[0].Config.Env[] | select(startswith("DB_NAME="))' | cut -d= -f2)
    echo -e "   - UAT DB Name: ${YELLOW}${DB_NAME_UAT}${CLEAR}"
    if [ "$DB_NAME_UAT" == "slip_processing_uat" ]; then
        echo -e "   ${GREEN}✔ DB Name is correct (slip_processing_uat)${CLEAR}"
    else
        echo -e "   ${RED}❌ ERROR: UAT is pointing to the wrong database: $DB_NAME_UAT${CLEAR}"
        exit 1
    fi

    # Check UAT port response
    echo "   - Checking HTTP response on Port 3001..."
    HTTP_STATUS_UAT=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/login)
    if [ "$HTTP_STATUS_UAT" == "200" ]; then
        echo -e "   ${GREEN}✔ Port 3001 answers with HTTP 200 OK${CLEAR}"
    else
        echo -e "   ${RED}❌ ERROR: Port 3001 returned HTTP $HTTP_STATUS_UAT${CLEAR}"
        exit 1
    fi
else
    echo -e "${RED}❌ ERROR: UAT container is NOT running!${CLEAR}"
    exit 1
fi

# 2. Check if Production container is running and healthy
echo -e "\n🔍 Checking Production container..."
if [ "$(docker ps -q -f name=suan-eak-web)" ]; then
    echo -e "${GREEN}✔ Production container (suan-eak-web) is running.${CLEAR}"
    
    # Check Prod Env Variables (Ensure DB is postgres)
    DB_NAME_PROD=$(docker inspect suan-eak-web | jq -r '.[0].Config.Env[] | select(startswith("DB_NAME="))' | cut -d= -f2)
    echo -e "   - Production DB Name: ${YELLOW}${DB_NAME_PROD}${CLEAR}"
    if [ "$DB_NAME_PROD" == "postgres" ]; then
        echo -e "   ${GREEN}✔ DB Name is correct (postgres)${CLEAR}"
    else
        echo -e "   ${RED}❌ ERROR: Production is pointing to the wrong database: $DB_NAME_PROD${CLEAR}"
        exit 1
    fi

    # Check Production local port response
    echo "   - Checking HTTP response inside Production container on Port 3000..."
    HTTP_STATUS_PROD=$(docker exec suan-eak-web node -e "fetch('http://127.0.0.1:3000/login').then(res => console.log(res.status))")
    if [ "$HTTP_STATUS_PROD" == "200" ]; then
        echo -e "   ${GREEN}✔ Port 3000 inside container answers with HTTP 200 OK${CLEAR}"
    else
        echo -e "   ${RED}❌ ERROR: Port 3000 inside container returned HTTP $HTTP_STATUS_PROD${CLEAR}"
        exit 1
    fi
else
    echo -e "${RED}❌ ERROR: Production container is NOT running!${CLEAR}"
    exit 1
fi

# 3. Test API endpoints
echo -e "\n🔍 Checking API Endpoints Decoupling (UAT)..."
SLIP_FILE_STATUS=$(docker exec suan-eak-web-uat node -e "fetch('http://127.0.0.1:3000/api/finance/revenue/slip-file?id=invalid-id').then(res => console.log(res.status))" || echo "failed")
if [ "$SLIP_FILE_STATUS" == "401" ] || [ "$SLIP_FILE_STATUS" == "404" ] || [ "$SLIP_FILE_STATUS" == "307" ] || [ "$SLIP_FILE_STATUS" == "302" ]; then
    echo -e "   ${GREEN}✔ /api/finance/revenue/slip-file is active (HTTP $SLIP_FILE_STATUS)${CLEAR}"
else
    echo -e "   ${RED}❌ ERROR: Unexpected status $SLIP_FILE_STATUS for /api/finance/revenue/slip-file${CLEAR}"
    exit 1
fi

SLIP_MNG_STATUS=$(docker exec suan-eak-web-uat node -e "fetch('http://127.0.0.1:3000/api/finance/payment-slips/file?id=invalid-id').then(res => console.log(res.status))" || echo "failed")
if [ "$SLIP_MNG_STATUS" == "401" ] || [ "$SLIP_MNG_STATUS" == "404" ] || [ "$SLIP_MNG_STATUS" == "307" ] || [ "$SLIP_MNG_STATUS" == "302" ]; then
    echo -e "   ${GREEN}✔ /api/finance/payment-slips/file is active (HTTP $SLIP_MNG_STATUS)${CLEAR}"
else
    echo -e "   ${RED}❌ ERROR: Unexpected status $SLIP_MNG_STATUS for /api/finance/payment-slips/file${CLEAR}"
    exit 1
fi

echo -e "\n${GREEN}====================================================${CLEAR}"
echo -e "${GREEN}🎉 ALL SMOKE TESTS AND ENVIRONMENT SANITY CHECKS PASSED SUCCESSFULLY!${CLEAR}"
echo -e "${GREEN}====================================================${CLEAR}"
