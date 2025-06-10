# Redis Cluster Docker Compose Setup

This document describes how to run Langfuse with a Redis cluster using the provided Docker Compose configuration.

## Overview

The `docker-compose.dev-redis-cluster.yml` file provides a complete Redis cluster setup for testing Langfuse's Redis cluster mode functionality. This setup includes:

- **3 Redis Master Nodes** (ports 7001-7003)
- **3 Redis Replica Nodes** (ports 7004-7006) 
- **Automatic Cluster Initialization**
- **Langfuse Application** configured for cluster mode
- **Supporting Services** (PostgreSQL, ClickHouse, MinIO)

## Quick Start

1. **Start the Redis cluster and Langfuse:**
   ```bash
   docker-compose -f docker-compose.dev-redis-cluster.yml up -d
   ```

2. **Wait for cluster initialization** (check logs):
   ```bash
   docker-compose -f docker-compose.dev-redis-cluster.yml logs redis-cluster-init
   ```

3. **Access Langfuse:**
   - Web UI: http://localhost:3000
   - API: http://localhost:3000/api

4. **Test the cluster** (optional):
   ```bash
   ./scripts/test-redis-cluster.sh
   ```

## Architecture

### Redis Cluster Topology

```
Master Nodes:          Replica Nodes:
├── redis-node1:7001   ├── redis-replica1:7004
├── redis-node2:7002   ├── redis-replica2:7005  
└── redis-node3:7003   └── redis-replica3:7006
```

Each master node has one replica for high availability. The cluster uses hash slots to distribute data across the three master nodes.

### Langfuse Configuration

The Langfuse service is configured with the following Redis cluster settings:

```yaml
environment:
  REDIS_CLUSTER_ENABLED: "true"
  REDIS_CLUSTER_NODES: "redis-node1:6379,redis-node2:6379,redis-node3:6379"
  REDIS_CLUSTER_PREFIX: "langfuse"
  REDIS_AUTH: "myredissecret"
```

## Environment Variables

You can customize the setup using environment variables:

```bash
# Redis authentication (default: myredissecret)
export REDIS_AUTH=your-secure-password

# Start with custom password
REDIS_AUTH=your-secure-password docker-compose -f docker-compose.dev-redis-cluster.yml up -d
```

## Testing the Cluster

### Manual Testing

Connect to any Redis node and test cluster operations:

```bash
# Connect to master node 1
docker exec -it $(docker ps -q -f name=redis-node1) redis-cli -a myredissecret

# Check cluster status
127.0.0.1:6379> CLUSTER INFO
127.0.0.1:6379> CLUSTER NODES

# Test key operations
127.0.0.1:6379> SET test:key "test-value"
127.0.0.1:6379> GET test:key
```

### Automated Testing

Use the provided test script:

```bash
./scripts/test-redis-cluster.sh
```

This script will:
- Test connectivity to all nodes
- Display cluster information
- Test key operations across nodes
- Test BullMQ hash tag functionality
- Provide failover testing instructions

## BullMQ Integration

The cluster is configured to work with Langfuse's BullMQ queues using hash tags:

- **Hash Tag Format:** `{langfuse}:queue-name`
- **Purpose:** Ensures all queue-related keys are on the same Redis node
- **Configurable:** Use `REDIS_CLUSTER_PREFIX` to change the hash tag

## Monitoring

### Cluster Health

Check cluster status:
```bash
docker exec -it $(docker ps -q -f name=redis-node1) redis-cli -a myredissecret cluster info
```

### Service Logs

Monitor service logs:
```bash
# All services
docker-compose -f docker-compose.dev-redis-cluster.yml logs -f

# Specific service
docker-compose -f docker-compose.dev-redis-cluster.yml logs -f langfuse
docker-compose -f docker-compose.dev-redis-cluster.yml logs -f redis-node1
```

## Troubleshooting

### Common Issues

1. **Cluster initialization fails:**
   - Check that all Redis nodes are healthy
   - Verify network connectivity between containers
   - Check Redis authentication settings

2. **Langfuse can't connect to cluster:**
   - Verify `REDIS_CLUSTER_NODES` configuration
   - Check Redis authentication (`REDIS_AUTH`)
   - Ensure cluster initialization completed successfully

3. **Performance issues:**
   - Monitor cluster slot distribution
   - Check for hot keys or uneven load
   - Consider adjusting `REDIS_CLUSTER_PREFIX` for load balancing

### Debugging Commands

```bash
# Check container status
docker-compose -f docker-compose.dev-redis-cluster.yml ps

# View cluster initialization logs
docker-compose -f docker-compose.dev-redis-cluster.yml logs redis-cluster-init

# Connect to Redis node for debugging
docker exec -it $(docker ps -q -f name=redis-node1) redis-cli -a myredissecret

# Check Langfuse application logs
docker-compose -f docker-compose.dev-redis-cluster.yml logs langfuse
```

## Cleanup

Stop and remove all services:
```bash
docker-compose -f docker-compose.dev-redis-cluster.yml down -v
```

This will remove all containers and volumes, including Redis data.

## Production Considerations

This setup is designed for development and testing. For production use:

1. **Security:** Use strong passwords and TLS encryption
2. **Persistence:** Configure proper volume mounts for data persistence  
3. **Monitoring:** Add comprehensive monitoring and alerting
4. **Backup:** Implement regular backup strategies
5. **Scaling:** Consider using managed Redis services for production workloads

See [REDIS_CLUSTER_SETUP.md](./REDIS_CLUSTER_SETUP.md) for detailed production deployment guidance.
