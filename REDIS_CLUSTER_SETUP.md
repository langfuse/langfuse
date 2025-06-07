# Redis Cluster Mode Support for Langfuse

This document describes how to configure and use Redis Cluster mode with Langfuse's BullMQ queue system.

## Overview

Langfuse now supports Redis Cluster mode for improved scalability and high availability. The implementation maintains full backward compatibility with single-node Redis configurations while adding cluster support for production deployments.

## Features

- **Backward Compatible**: Existing single-node Redis configurations continue to work unchanged
- **BullMQ Compatible**: Uses proper hash tags to ensure queue keys are placed on the same Redis cluster node
- **Graceful Fallback**: Automatically falls back to single-node mode if cluster configuration is invalid
- **Production Ready**: Includes proper error handling, logging, and retry mechanisms

## Configuration

### Environment Variables

Add the following environment variables to enable Redis cluster mode:

```bash
# Enable Redis cluster mode (default: false)
REDIS_CLUSTER_ENABLED=true

# Comma-separated list of Redis cluster nodes
REDIS_CLUSTER_NODES=redis-node1:6379,redis-node2:6379,redis-node3:6379

# Hash tag prefix for BullMQ compatibility (default: langfuse)
REDIS_CLUSTER_PREFIX=langfuse

# Existing Redis configuration (still supported for single-node mode)
# REDIS_HOST=localhost
# REDIS_PORT=6379
# REDIS_AUTH=your-password
# REDIS_CONNECTION_STRING=redis://localhost:6379
```

### Single-Node Mode (Default)

If `REDIS_CLUSTER_ENABLED` is not set or is `false`, Langfuse will use single-node Redis mode with existing configuration:

```bash
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_AUTH=your-password
```

### Cluster Mode

To enable cluster mode, set the following:

```bash
REDIS_CLUSTER_ENABLED=true
REDIS_CLUSTER_NODES=node1:6379,node2:6379,node3:6379
REDIS_AUTH=your-cluster-password
```

## BullMQ Cluster Compatibility

Redis Cluster requires special handling for BullMQ queues because BullMQ operations span multiple keys that must be on the same Redis node. This implementation uses Redis hash tags to ensure compatibility:

- **Hash Tags**: All queue keys use the format `{langfuse}:queue-name` to ensure they're placed on the same hash slot
- **Configurable Prefix**: The hash tag prefix can be customized via `REDIS_CLUSTER_PREFIX`
- **Multiple Queues**: Different prefixes can be used for different queue groups to distribute load across cluster nodes

## Deployment Examples

### Docker Compose with Redis Cluster

```yaml
version: '3.8'
services:
  langfuse:
    image: langfuse/langfuse:latest
    environment:
      REDIS_CLUSTER_ENABLED: "true"
      REDIS_CLUSTER_NODES: "redis-node1:6379,redis-node2:6379,redis-node3:6379"
      REDIS_AUTH: "your-cluster-password"
      # ... other environment variables

  redis-node1:
    image: redis:7-alpine
    command: redis-server --cluster-enabled yes --cluster-config-file nodes.conf --cluster-node-timeout 5000 --appendonly yes --requirepass your-cluster-password
    
  redis-node2:
    image: redis:7-alpine
    command: redis-server --cluster-enabled yes --cluster-config-file nodes.conf --cluster-node-timeout 5000 --appendonly yes --requirepass your-cluster-password
    
  redis-node3:
    image: redis:7-alpine
    command: redis-server --cluster-enabled yes --cluster-config-file nodes.conf --cluster-node-timeout 5000 --appendonly yes --requirepass your-cluster-password
```

### Kubernetes with Redis Cluster

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: langfuse
spec:
  template:
    spec:
      containers:
      - name: langfuse
        image: langfuse/langfuse:latest
        env:
        - name: REDIS_CLUSTER_ENABLED
          value: "true"
        - name: REDIS_CLUSTER_NODES
          value: "redis-cluster-service:6379"
        - name: REDIS_AUTH
          valueFrom:
            secretKeyRef:
              name: redis-secret
              key: password
```

## Monitoring and Troubleshooting

### Logs

The implementation provides detailed logging for cluster operations:

```
INFO: Redis cluster connected
INFO: Redis cluster ready
ERROR: Redis cluster error: <error details>
ERROR: REDIS_CLUSTER_NODES is required when REDIS_CLUSTER_ENABLED is true
```

### Health Checks

Monitor cluster health through:
- Redis cluster status: `CLUSTER INFO`
- Queue metrics: Available through Langfuse's existing metrics endpoints
- Connection status: Check application logs for connection events

### Common Issues

1. **Invalid Node Format**: Ensure `REDIS_CLUSTER_NODES` uses the format `host:port,host:port`
2. **Authentication**: All cluster nodes must use the same password
3. **Network Connectivity**: Ensure all nodes are reachable from the Langfuse application
4. **Hash Tag Conflicts**: Use different `REDIS_CLUSTER_PREFIX` values for different applications sharing the same cluster

## Migration from Single-Node

1. **No Code Changes Required**: The implementation is fully backward compatible
2. **Environment Variables**: Add cluster configuration variables
3. **Gradual Migration**: Test with a subset of queues first by using different prefixes
4. **Rollback**: Simply set `REDIS_CLUSTER_ENABLED=false` to revert to single-node mode

## Performance Considerations

- **Read Replicas**: Cluster mode enables reading from replica nodes for better performance
- **Load Distribution**: Use different cluster prefixes to distribute queues across nodes
- **Connection Pooling**: Each queue and worker maintains its own Redis connection
- **Retry Logic**: Built-in retry mechanisms handle temporary cluster failures

## Security

- **Authentication**: Use `REDIS_AUTH` for cluster-wide authentication
- **TLS**: Existing TLS configuration (`REDIS_TLS_*` variables) works with cluster mode
- **Network Security**: Secure cluster node communication according to Redis cluster best practices
