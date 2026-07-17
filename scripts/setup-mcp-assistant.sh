#!/bin/bash
# Setup MCP Assistant connection to AI Chat backend
# This script registers the mcp-assistant server and connects to it

set -e

BACKEND_URL="${BACKEND_URL:-http://localhost:8082}"
MCP_ASSISTANT_URL="http://host.docker.internal:3000/mcp"

echo "=== MCP Assistant Setup Script ==="
echo "Backend URL: $BACKEND_URL"
echo "MCP Assistant URL: $MCP_ASSISTANT_URL"
echo ""

# Step 1: Check if mcp-assistant is already registered
echo "Step 1: Checking for existing mcp-assistant registration..."
EXISTING_SERVER=$(curl -s "$BACKEND_URL/api/mcp/servers" | grep -o '"name":"mcp-assistant"' || true)

if [ -n "$EXISTING_SERVER" ]; then
    echo "✓ mcp-assistant is already registered"
    SERVER_ID=$(curl -s "$BACKEND_URL/api/mcp/servers" | grep -A 5 '"name":"mcp-assistant"' | grep -o '"id":[0-9]*' | head -1 | grep -o '[0-9]*')
    echo "  Server ID: $SERVER_ID"
else
    echo "Registering mcp-assistant server..."
    REGISTER_RESPONSE=$(curl -s -X POST "$BACKEND_URL/api/mcp/servers" \
        -H "Content-Type: application/json" \
        -d "{
            \"name\": \"mcp-assistant\",
            \"url\": \"$MCP_ASSISTANT_URL\",
            \"transportType\": \"HTTP\"
        }")
    
    echo "Response: $REGISTER_RESPONSE"
    SERVER_ID=$(echo "$REGISTER_RESPONSE" | grep -o '"id":[0-9]*' | grep -o '[0-9]*')
    
    if [ -z "$SERVER_ID" ]; then
        echo "✗ Failed to register mcp-assistant server"
        exit 1
    fi
    echo "✓ Registered mcp-assistant with ID: $SERVER_ID"
fi

echo ""

# Step 2: Check connection status
echo "Step 2: Checking connection status..."
CONNECTION_STATUS=$(curl -s "$BACKEND_URL/api/mcp/servers/$SERVER_ID/connection")
echo "Connection status: $CONNECTION_STATUS"

IS_CONNECTED=$(echo "$CONNECTION_STATUS" | grep -o '"connected":true' || true)

if [ -n "$IS_CONNECTED" ]; then
    echo "✓ Already connected to mcp-assistant"
else
    echo "Connecting to mcp-assistant..."
    CONNECT_RESPONSE=$(curl -s -X POST "$BACKEND_URL/api/mcp/servers/$SERVER_ID/connect")
    echo "Response: $CONNECT_RESPONSE"
    
    SUCCESS=$(echo "$CONNECT_RESPONSE" | grep -o '"success":true' || true)
    if [ -z "$SUCCESS" ]; then
        echo "✗ Failed to connect to mcp-assistant"
        echo "Response: $CONNECT_RESPONSE"
        exit 1
    fi
    echo "✓ Connected to mcp-assistant"
fi

echo ""

# Step 3: List available tools
echo "Step 3: Listing available tools..."
TOOLS_RESPONSE=$(curl -s "$BACKEND_URL/api/mcp/servers/$SERVER_ID/tools")
echo "Tools response: $TOOLS_RESPONSE"

TOOL_COUNT=$(echo "$TOOLS_RESPONSE" | grep -o '"count":[0-9]*' | grep -o '[0-9]*')
if [ -z "$TOOL_COUNT" ]; then
    echo "✗ Failed to list tools"
    exit 1
fi

echo "✓ Connected with $TOOL_COUNT tools available"

echo ""
echo "=== Setup Complete ==="
echo "MCP Assistant is ready!"
echo "Server ID: $SERVER_ID"
echo "Tools available: $TOOL_COUNT"
echo ""
echo "You can now chat with the AI and it will have access to mcp-assistant tools."
