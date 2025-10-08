# Documentation Update Proposal: Custom Base Path for Helm Deployments

**Linear Issue:** LFE-7112  
**Issue Type:** Documentation Enhancement  
**Priority:** Important - Prevents deployment failures  

## Problem Statement

The current documentation for [Custom Base Path configuration for self-hosted LangFuse](https://langfuse.com/self-hosting/configuration/custom-base-path) provides general guidance applicable to all deployment scenarios but **does not address specific adjustments required for Helm deployments**.

Specifically, when deploying Langfuse with a custom base path using Helm, users **must** update the `livenessProbe` and `readinessProbe` configurations to include the custom base path prefix. Failure to do so results in:

- Pods stuck in `CrashLoopBackOff` due to failed liveness probes
- Pods never becoming `Ready` due to failed readiness probes  
- 404 errors in pod logs from health check attempts
- Service unavailability and 503 errors

This is a critical step that is easy to miss and causes deployment failures.

## Proposed Solution

Update the documentation page at `https://langfuse.com/self-hosting/configuration/custom-base-path` to include Helm-specific guidance.

### Suggested Location

Under the **"Run LangFuse"** section, add a new subsection or callout box titled:

**"Important: Helm/Kubernetes Deployments"**

### Suggested Content

```markdown
## Important: Helm/Kubernetes Deployments

When deploying Langfuse with a custom base path using Helm or Kubernetes, you **must** update the health check probe configurations in addition to setting the environment variables.

### Required Changes

If your custom base path is `/langfuse`, update your Helm values:

**For the Web Service:**

```yaml
web:
  env:
    - name: NEXT_PUBLIC_BASE_PATH
      value: "/langfuse"
  
  # CRITICAL: Include the base path in probe URLs
  livenessProbe:
    httpGet:
      path: /langfuse/api/public/health  # ← Note the base path prefix
      port: 3000
  
  readinessProbe:
    httpGet:
      path: /langfuse/api/public/ready   # ← Note the base path prefix
      port: 3000
```

**For the Worker Service:**

The worker service health checks do NOT require the custom base path prefix:

```yaml
worker:
  livenessProbe:
    httpGet:
      path: /api/health  # ← No base path prefix
      port: 3030
  
  readinessProbe:
    httpGet:
      path: /api/ready   # ← No base path prefix
      port: 3030
```

### Why This Matters

Kubernetes uses these probes to determine if your pods are healthy and ready to receive traffic. Without the correct probe paths:
- Pods will fail liveness checks and restart repeatedly
- Pods will never become ready, resulting in service unavailability
- You'll see 404 errors in your pod logs

### Example and Additional Resources

For a complete example and troubleshooting guide, see:
- [Helm Custom Base Path Configuration Guide](https://github.com/langfuse/langfuse/blob/main/docs/CUSTOM_BASE_PATH_HELM.md)
- [Example Helm Values File](https://github.com/langfuse/langfuse/blob/main/docs/examples/helm-values-custom-base-path.yaml)
```

## Alternative Approach

Alternatively, this could be added as:

1. **A callout box** (warning/important style) in the "Run LangFuse" section
2. **A separate documentation page** linked from the custom base path page
3. **An addition to the Helm chart README** with cross-references

## Supporting Materials

The following files have been created in the `langfuse/langfuse` repository to support this documentation update:

1. **`/docs/CUSTOM_BASE_PATH_HELM.md`** - Comprehensive guide with:
   - Overview and prerequisites
   - Step-by-step configuration instructions
   - Complete example configurations
   - Verification steps
   - Troubleshooting common issues
   - Links to additional resources

2. **`/docs/examples/helm-values-custom-base-path.yaml`** - Complete, production-ready example Helm values file demonstrating correct configuration

3. **`/docs/README.md`** - Index of documentation files in the repo

4. **Updated `/README.md`** - Main README now references the Helm custom base path guide

## Impact

**High Priority** - This issue affects all users who:
- Deploy Langfuse using Helm/Kubernetes (recommended production deployment method)
- Need to use a custom base path (common in enterprise environments with path-based routing)

Without this documentation, users will experience deployment failures and spend significant time debugging.

## Implementation Checklist

For the documentation team:

- [ ] Review the proposed content
- [ ] Determine the best location in the docs structure
- [ ] Add the Helm-specific guidance to the custom base path page
- [ ] Consider adding a visual diagram showing the probe path structure
- [ ] Add to the Kubernetes/Helm deployment guide as well
- [ ] Update any related documentation pages
- [ ] Test the instructions with a fresh Helm deployment
- [ ] Announce the documentation update in release notes/changelog

## References

- **Linear Issue:** LFE-7112
- **Repository:** https://github.com/langfuse/langfuse
- **Documentation Repository:** https://github.com/langfuse/langfuse-docs
- **Related Documentation:**
  - https://langfuse.com/self-hosting/configuration/custom-base-path
  - https://langfuse.com/self-hosting/kubernetes-helm
  - https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/

## Contact

For questions about this proposal, please comment on Linear issue LFE-7112 or reach out via:
- GitHub Discussions: https://github.com/orgs/langfuse/discussions
- Discord: https://discord.com/invite/7NXusRtqYU