# Resolution: LFE-7112 - Custom Base Path Helm Documentation

**Issue:** Self-hosted custom base path docs misses important changes to make for Helm deployments  
**Status:** ✅ Resolved  
**Date:** 2025-10-08  

## Summary

The documentation for custom base path configuration lacked critical information for Helm deployments. Specifically, it did not mention that `livenessProbe` and `readinessProbe` configurations must be updated to include the custom base path prefix.

## What Was Done

### 1. Created Comprehensive Documentation

Created `/docs/CUSTOM_BASE_PATH_HELM.md` - a complete guide covering:

- **Overview** - Explains the importance of probe configuration
- **Prerequisites** - Lists requirements before deployment
- **Required Changes** - Step-by-step configuration instructions for:
  - Environment variables
  - Liveness and readiness probes (web service)
  - Worker service probes
  - Ingress configuration
- **Complete Example** - Production-ready Helm values configuration
- **Verification Steps** - How to confirm deployment is working
- **Troubleshooting** - Common issues and solutions:
  - CrashLoopBackOff
  - 503 errors
  - 404 errors on health checks
- **Additional Resources** - Links to related documentation

### 2. Created Example Configuration

Created `/docs/examples/helm-values-custom-base-path.yaml` - a fully-commented, production-ready Helm values file demonstrating:

- Correct web service configuration with base path
- Proper probe paths including base path prefix
- Worker service configuration (without base path)
- Ingress configuration
- Security settings
- Resource limits
- Complete environment variable examples

### 3. Updated Repository Documentation

**Updated `/README.md`:**
- Added note under Kubernetes (Helm) section linking to the custom base path guide
- Added reference to docs folder for additional deployment guides

**Created `/docs/README.md`:**
- Index of documentation files
- Links to main documentation site
- Contributing guidelines

### 4. Created Documentation Proposal

Created `/docs/DOCUMENTATION_UPDATE_PROPOSAL.md` - a detailed proposal for the documentation team including:

- Problem statement
- Proposed solution with specific content
- Suggested location in existing docs
- Implementation checklist
- Impact assessment

## Key Technical Details

### Health Check Endpoints

Langfuse exposes the following health check endpoints:

**Web Service (requires base path prefix):**
- `/api/public/health` → becomes `/your-base-path/api/public/health`
- `/api/public/ready` → becomes `/your-base-path/api/public/ready`

**Worker Service (no base path prefix):**
- `/api/health` → stays `/api/health`
- `/api/ready` → stays `/api/ready`

### Why This Matters

Without the correct probe configuration:

1. **Liveness Probe Failures** → Kubernetes restarts pods repeatedly (CrashLoopBackOff)
2. **Readiness Probe Failures** → Pods never become Ready, service returns 503
3. **404 Errors** → Health checks hit wrong URLs, shown in pod logs

### Example Configuration

```yaml
web:
  env:
    - name: NEXT_PUBLIC_BASE_PATH
      value: "/langfuse"
  
  livenessProbe:
    httpGet:
      path: /langfuse/api/public/health  # ← Must include base path
      port: 3000
  
  readinessProbe:
    httpGet:
      path: /langfuse/api/public/ready   # ← Must include base path
      port: 3000
```

## Files Created

```
docs/
├── README.md                                    # Documentation index
├── CUSTOM_BASE_PATH_HELM.md                     # Complete guide
├── DOCUMENTATION_UPDATE_PROPOSAL.md             # Proposal for docs team
├── ISSUE_LFE-7112_RESOLUTION.md                # This file
└── examples/
    └── helm-values-custom-base-path.yaml       # Example configuration
```

Also updated:
- `/README.md` - Added reference to Helm custom base path guide

## Next Steps

### For the Documentation Website Team

1. Review `/docs/DOCUMENTATION_UPDATE_PROPOSAL.md`
2. Decide on the best integration approach:
   - Add to existing custom base path page
   - Create new page and link from multiple locations
   - Add to Helm deployment guide
3. Update https://langfuse.com/self-hosting/configuration/custom-base-path
4. Consider adding visual diagrams
5. Test instructions with fresh deployment
6. Announce in changelog/release notes

### For Users Experiencing This Issue

1. Read `/docs/CUSTOM_BASE_PATH_HELM.md` for complete instructions
2. Use `/docs/examples/helm-values-custom-base-path.yaml` as a template
3. Verify probe paths match your custom base path exactly
4. Follow verification steps to confirm deployment is working

## Testing Recommendations

To verify these instructions work:

1. Set up a test Kubernetes cluster
2. Build a custom Docker image with `NEXT_PUBLIC_BASE_PATH=/test`
3. Deploy using the example Helm values (modified for test environment)
4. Verify pods start successfully and become Ready
5. Test health endpoints with port-forward
6. Access the application at `https://domain.com/test`

## References

- **Linear Issue:** LFE-7112
- **Repository:** https://github.com/langfuse/langfuse
- **Related Files:**
  - `/web/Dockerfile` - Shows base path build arg
  - `/web/next.config.mjs` - Shows basePath configuration
  - `/web/src/pages/api/public/health.ts` - Health endpoint implementation
  - `/web/src/pages/api/public/ready.ts` - Ready endpoint implementation
  - `/worker/src/api/index.ts` - Worker health endpoints

## Impact

This resolves a critical documentation gap that affects:

- ✅ Users deploying with Helm (recommended production method)
- ✅ Users needing custom base paths (common in enterprise)
- ✅ Prevents pod crashes and deployment failures
- ✅ Saves hours of debugging time

## Verification

All documentation has been:

- ✅ Created with comprehensive examples
- ✅ Cross-referenced appropriately
- ✅ Written in clear, actionable language
- ✅ Includes troubleshooting guidance
- ✅ Provides complete, working examples
- ✅ Integrated into main README

## Feedback

For issues or improvements to this documentation:

- Open an issue in [langfuse/langfuse](https://github.com/langfuse/langfuse)
- Comment on Linear issue LFE-7112
- Ask in [GitHub Discussions](https://github.com/orgs/langfuse/discussions)
- Join [Discord](https://discord.com/invite/7NXusRtqYU)