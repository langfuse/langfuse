#!/bin/bash

# Redis Cluster Test Script
# This script helps test the Redis cluster setup in docker-compose.dev-redis-cluster.yml

set -e

REDIS_AUTH=${REDIS_AUTH:-myredissecret}

echo "🔍 Testing Redis Cluster Setup..."
echo "=================================="

# Function to test Redis connection
test_redis_connection() {
    local host=$1
    local port=$2
    local name=$3
    
    echo "Testing $name ($host:$port)..."
    if docker exec -it $(docker ps -q -f name=$host) redis-cli -a $REDIS_AUTH ping > /dev/null 2>&1; then
        echo "✅ $name is responding"
    else
        echo "❌ $name is not responding"
        return 1
    fi
}

# Function to get cluster info
get_cluster_info() {
    echo ""
    echo "📊 Cluster Information:"
    echo "======================"
    
    echo "Cluster Info:"
    docker exec -it $(docker ps -q -f name=redis-node1) redis-cli -a $REDIS_AUTH cluster info
    
    echo ""
    echo "Cluster Nodes:"
    docker exec -it $(docker ps -q -f name=redis-node1) redis-cli -a $REDIS_AUTH cluster nodes
}

# Function to test cluster operations
test_cluster_operations() {
    echo ""
    echo "🧪 Testing Cluster Operations:"
    echo "=============================="
    
    # Test setting and getting keys
    echo "Setting test keys..."
    docker exec -it $(docker ps -q -f name=redis-node1) redis-cli -a $REDIS_AUTH set test:key1 "value1"
    docker exec -it $(docker ps -q -f name=redis-node2) redis-cli -a $REDIS_AUTH set test:key2 "value2"
    docker exec -it $(docker ps -q -f name=redis-node3) redis-cli -a $REDIS_AUTH set test:key3 "value3"
    
    echo "Getting test keys from different nodes..."
    val1=$(docker exec -it $(docker ps -q -f name=redis-node1) redis-cli -a $REDIS_AUTH get test:key1 | tr -d '\r')
    val2=$(docker exec -it $(docker ps -q -f name=redis-node2) redis-cli -a $REDIS_AUTH get test:key2 | tr -d '\r')
    val3=$(docker exec -it $(docker ps -q -f name=redis-node3) redis-cli -a $REDIS_AUTH get test:key3 | tr -d '\r')
    
    echo "Retrieved values: $val1, $val2, $val3"
    
    # Test BullMQ-style hash tags
    echo "Testing BullMQ hash tags..."
    docker exec -it $(docker ps -q -f name=redis-node1) redis-cli -a $REDIS_AUTH set "{langfuse}:queue:test" "bullmq-test"
    hash_val=$(docker exec -it $(docker ps -q -f name=redis-node1) redis-cli -a $REDIS_AUTH get "{langfuse}:queue:test" | tr -d '\r')
    echo "Hash tag test value: $hash_val"
    
    # Clean up test keys
    echo "Cleaning up test keys..."
    docker exec -it $(docker ps -q -f name=redis-node1) redis-cli -a $REDIS_AUTH del test:key1 test:key2 test:key3 "{langfuse}:queue:test"
}

# Function to test failover
test_failover() {
    echo ""
    echo "🔄 Testing Failover (Optional):"
    echo "==============================="
    echo "To test failover manually:"
    echo "1. Stop a master node: docker stop <container_name>"
    echo "2. Check cluster status: docker exec -it <node> redis-cli -a $REDIS_AUTH cluster nodes"
    echo "3. Verify replica promotion"
    echo "4. Restart the stopped node: docker start <container_name>"
}

# Main execution
echo "Checking if Redis cluster containers are running..."

# Test individual node connections
test_redis_connection "redis-node1" "7001" "Redis Node 1 (Master)"
test_redis_connection "redis-node2" "7002" "Redis Node 2 (Master)"  
test_redis_connection "redis-node3" "7003" "Redis Node 3 (Master)"

# Get cluster information
get_cluster_info

# Test cluster operations
test_cluster_operations

# Show failover testing info
test_failover

echo ""
echo "✅ Redis Cluster Test Complete!"
echo ""
echo "🚀 To start Langfuse with Redis cluster:"
echo "   docker-compose -f docker-compose.dev-redis-cluster.yml up -d"
echo ""
echo "🔗 Access Langfuse at: http://localhost:3000"
echo "📊 Redis cluster nodes available at:"
echo "   - Node 1: localhost:7001"
echo "   - Node 2: localhost:7002" 
echo "   - Node 3: localhost:7003"
