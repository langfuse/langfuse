# Linear Issue LFE-7112 - Resolution Summary

## ✅ Issue Resolved

I've addressed the documentation gap for custom base path configuration in Helm deployments. The issue has been resolved with comprehensive documentation and examples.

## 📚 What Was Created

### 1. Complete Documentation Guide
**File:** [`docs/CUSTOM_BASE_PATH_HELM.md`](https://github.com/langfuse/langfuse/blob/main/docs/CUSTOM_BASE_PATH_HELM.md)

A comprehensive guide covering:
- Overview and prerequisites
- Step-by-step configuration for Helm deployments
- **Critical probe configuration requirements** (the missing piece)
- Complete working example
- Verification steps
- Troubleshooting common issues

### 2. Production-Ready Example
**File:** [`docs/examples/helm-values-custom-base-path.yaml`](https://github.com/langfuse/langfuse/blob/main/docs/examples/helm-values-custom-base-path.yaml)

A fully-commented Helm values file demonstrating:
- Correct probe paths with base path prefix
- Environment variable configuration
- Ingress setup
- Security settings
- Complete production configuration

### 3. Documentation Proposal
**File:** [`docs/DOCUMENTATION_UPDATE_PROPOSAL.md`](https://github.com/langfuse/langfuse/blob/main/docs/DOCUMENTATION_UPDATE_PROPOSAL.md)

A detailed proposal for the documentation team to integrate this into the main docs site at https://langfuse.com/self-hosting/configuration/custom-base-path

### 4. Updated Main README
The main [README.md](https://github.com/langfuse/langfuse/blob/main/README.md) now includes a note in the Kubernetes (Helm) section linking to the custom base path guide.

## 🎯 Key Takeaway - The Critical Missing Piece

When using a custom base path like `/langfuse`, you MUST update the probe configurations:

```yaml
web:
  env:
    - name: NEXT_PUBLIC_BASE_PATH
      value: "/langfuse"
  
  # CRITICAL: Include the base path in probe URLs
  livenessProbe:
    httpGet:
      path: /langfuse/api/public/health  # ← Must include base path prefix
      port: 3000
  
  readinessProbe:
    httpGet:
      path: /langfuse/api/public/ready   # ← Must include base path prefix
      port: 3000
```

**Without this configuration:**
- Pods crash with `CrashLoopBackOff` (failed liveness probes)
- Pods never become `Ready` (failed readiness probes)
- Service returns 503 errors
- Pod logs show 404 errors from health checks

## 📋 For the Documentation Team

The [`DOCUMENTATION_UPDATE_PROPOSAL.md`](https://github.com/langfuse/langfuse/blob/main/docs/DOCUMENTATION_UPDATE_PROPOSAL.md) file contains:

1. Exact text to add to the existing documentation page
2. Suggested location (under "Run LangFuse" section)
3. Alternative integration approaches
4. Implementation checklist

**Recommended action:** Add a prominent warning/note box to https://langfuse.com/self-hosting/configuration/custom-base-path with the probe configuration requirements.

## 🔗 Quick Links

- **Main Guide:** [`docs/CUSTOM_BASE_PATH_HELM.md`](https://github.com/langfuse/langfuse/blob/main/docs/CUSTOM_BASE_PATH_HELM.md)
- **Example Config:** [`docs/examples/helm-values-custom-base-path.yaml`](https://github.com/langfuse/langfuse/blob/main/docs/examples/helm-values-custom-base-path.yaml)
- **Docs Proposal:** [`docs/DOCUMENTATION_UPDATE_PROPOSAL.md`](https://github.com/langfuse/langfuse/blob/main/docs/DOCUMENTATION_UPDATE_PROPOSAL.md)
- **Current Docs (to be updated):** https://langfuse.com/self-hosting/configuration/custom-base-path

## ✨ Impact

This documentation will help:
- ✅ Prevent pod crashes and deployment failures
- ✅ Save hours of debugging time
- ✅ Provide clear, actionable guidance
- ✅ Support enterprise users with path-based routing requirements

## 📝 Next Steps

1. **Immediate:** Users can reference the new documentation in this repo
2. **Short-term:** Documentation team reviews and integrates into langfuse-docs
3. **Long-term:** Consider adding this check to Helm chart templates or validation

---

**Status:** Ready for documentation team review and integration
**Files Changed:** 5 files created, 1 file updated (README.md)
**Total Lines:** ~940 lines of documentation and examples