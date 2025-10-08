# Custom Base Path Configuration for Helm Deployments

This guide provides important additional considerations when deploying Langfuse with a custom base path using Helm.

## Overview

When deploying Langfuse with a custom base path (e.g., `/langfuse` or `/app`), you need to configure not only the environment variables but also update the health check probe configurations in your Helm deployment. This is critical to ensure Kubernetes can properly monitor the health and readiness of your Langfuse pods.

## Prerequisites

Before proceeding, ensure you have:
- Completed the standard custom base path configuration as documented in the [Custom Base Path configuration](https://langfuse.com/self-hosting/configuration/custom-base-path)
- Built a custom Docker image with `NEXT_PUBLIC_BASE_PATH` set during build time
- Access to modify your Helm chart values

## Required Changes for Helm Deployments

### 1. Environment Variable Configuration

First, ensure your Helm values include the custom base path environment variable:

```yaml
web:
  env:
    - name: NEXT_PUBLIC_BASE_PATH
      value: "/your-custom-path"
```

### 2. Update Health Check Probes (Critical)

**This is the most important step that is often missed.** 

Kubernetes uses `livenessProbe` and `readinessProbe` to determine if your pods are healthy and ready to receive traffic. When using a custom base path, these probe paths must be updated to include the base path prefix.

#### Default Health Check Endpoints

Without a custom base path, Langfuse exposes these health check endpoints:
- `/api/public/health` - Health check endpoint
- `/api/public/ready` - Readiness check endpoint
- `/api/health` - Alternative health check endpoint

#### Updated Probe Configuration

If your custom base path is `/langfuse`, you must update the probes in your Helm values:

**For the Web Service:**

```yaml
web:
  # ... other web configuration ...
  
  livenessProbe:
    httpGet:
      path: /langfuse/api/public/health  # Note: includes the base path
      port: 3000
    initialDelaySeconds: 30
    periodSeconds: 10
    timeoutSeconds: 5
    failureThreshold: 3
  
  readinessProbe:
    httpGet:
      path: /langfuse/api/public/ready  # Note: includes the base path
      port: 3000
    initialDelaySeconds: 10
    periodSeconds: 5
    timeoutSeconds: 3
    failureThreshold: 3
```

**For the Worker Service:**

```yaml
worker:
  # ... other worker configuration ...
  
  livenessProbe:
    httpGet:
      path: /api/health  # Worker doesn't use base path for health checks
      port: 3030
    initialDelaySeconds: 30
    periodSeconds: 10
    timeoutSeconds: 5
    failureThreshold: 3
  
  readinessProbe:
    httpGet:
      path: /api/ready  # Worker doesn't use base path for health checks
      port: 3030
    initialDelaySeconds: 10
    periodSeconds: 5
    timeoutSeconds: 3
    failureThreshold: 3
```

> **Important:** The worker service health checks do NOT require the custom base path prefix, only the web service does.

### 3. Ingress Configuration

If you're using an Ingress controller, ensure your ingress path also reflects the custom base path:

```yaml
ingress:
  enabled: true
  hosts:
    - host: your-domain.com
      paths:
        - path: /langfuse  # Your custom base path
          pathType: Prefix
          backend:
            service:
              name: langfuse-web
              port:
                number: 3000
```

## Complete Example

Here's a complete example of Helm values for a Langfuse deployment with custom base path `/langfuse`:

```yaml
# values.yaml
web:
  image:
    repository: your-registry/langfuse
    tag: custom-base-path  # Your custom-built image
    pullPolicy: IfNotPresent
  
  env:
    - name: NEXT_PUBLIC_BASE_PATH
      value: "/langfuse"
    - name: NEXTAUTH_URL
      value: "https://your-domain.com/langfuse"
    # ... other environment variables ...
  
  livenessProbe:
    httpGet:
      path: /langfuse/api/public/health
      port: 3000
    initialDelaySeconds: 30
    periodSeconds: 10
    timeoutSeconds: 5
    failureThreshold: 3
  
  readinessProbe:
    httpGet:
      path: /langfuse/api/public/ready
      port: 3000
    initialDelaySeconds: 10
    periodSeconds: 5
    timeoutSeconds: 3
    failureThreshold: 3

worker:
  image:
    repository: your-registry/langfuse-worker
    tag: latest
    pullPolicy: IfNotPresent
  
  env:
    # Worker doesn't need NEXT_PUBLIC_BASE_PATH
    # ... other environment variables ...
  
  livenessProbe:
    httpGet:
      path: /api/health
      port: 3030
    initialDelaySeconds: 30
    periodSeconds: 10
    timeoutSeconds: 5
    failureThreshold: 3
  
  readinessProbe:
    httpGet:
      path: /api/ready
      port: 3030
    initialDelaySeconds: 10
    periodSeconds: 5
    timeoutSeconds: 3
    failureThreshold: 3

ingress:
  enabled: true
  className: nginx  # or your ingress class
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
  hosts:
    - host: your-domain.com
      paths:
        - path: /langfuse
          pathType: Prefix
  tls:
    - secretName: langfuse-tls
      hosts:
        - your-domain.com
```

## Verification

After deploying with the updated configuration, verify that:

1. **Pods are running and ready:**
   ```bash
   kubectl get pods -n your-namespace
   ```
   All pods should show status `Running` and `READY 1/1`.

2. **Health checks are working:**
   ```bash
   # Port-forward to your web service
   kubectl port-forward -n your-namespace svc/langfuse-web 3000:3000
   
   # Test the health endpoint (note the base path)
   curl http://localhost:3000/langfuse/api/public/health
   
   # Expected response:
   # {"status":"OK","version":"..."}
   ```

3. **Check pod events for probe failures:**
   ```bash
   kubectl describe pod -n your-namespace <pod-name>
   ```
   Look for any warnings about `Liveness probe failed` or `Readiness probe failed`.

## Common Issues

### Issue: Pods are in CrashLoopBackOff

**Symptoms:**
- Pods repeatedly restart
- `kubectl describe pod` shows `Liveness probe failed`

**Solution:**
- Verify that the `livenessProbe.httpGet.path` includes your custom base path
- Check that your Docker image was built with `NEXT_PUBLIC_BASE_PATH` set
- Increase `initialDelaySeconds` if the application needs more time to start

### Issue: Service is unavailable / 503 errors

**Symptoms:**
- Service exists but returns 503 errors
- Pods are running but never become `Ready`

**Solution:**
- Verify that the `readinessProbe.httpGet.path` includes your custom base path
- Check pod logs: `kubectl logs -n your-namespace <pod-name>`
- Test the health endpoint manually using port-forward

### Issue: 404 errors on health checks

**Symptoms:**
- Pod logs show 404 errors for health check requests
- Probe failures in pod events

**Solution:**
- Double-check that both the `NEXT_PUBLIC_BASE_PATH` environment variable and probe paths match exactly
- Ensure there are no trailing slashes in either configuration
- Verify the custom Docker image was built correctly with the base path

## Additional Resources

- [Official Langfuse Self-Hosting Documentation](https://langfuse.com/self-hosting)
- [Langfuse Custom Base Path Configuration](https://langfuse.com/self-hosting/configuration/custom-base-path)
- [Langfuse Kubernetes/Helm Deployment Guide](https://langfuse.com/self-hosting/kubernetes-helm)
- [Kubernetes Liveness and Readiness Probes](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/)

## Contributing

If you find any issues with this guide or have suggestions for improvements, please:
1. Open an issue in the [langfuse/langfuse](https://github.com/langfuse/langfuse) repository
2. Submit a pull request to the [langfuse/langfuse-docs](https://github.com/langfuse/langfuse-docs) repository

## Support

For additional help:
- [GitHub Discussions](https://github.com/orgs/langfuse/discussions)
- [Discord Community](https://discord.com/invite/7NXusRtqYU)
- [Documentation](https://langfuse.com/docs)