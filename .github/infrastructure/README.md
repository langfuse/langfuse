# Infrastructure Documentation

This directory contains infrastructure-related documentation and tools for managing Langfuse's AWS ECS deployment.

## Contents

### 📋 ECS Autoscaling Implementation (LFE-7918)

Files related to implementing CPU-based autoscaling for web containers to prevent high latency issues from CPU constraints.

#### [ECS_AUTOSCALING_GUIDE.md](./ECS_AUTOSCALING_GUIDE.md)
Comprehensive guide covering:
- Problem statement and solution overview
- Multiple implementation options (Console, CLI, Terraform, CloudFormation)
- Configuration parameters and recommendations
- Monitoring and validation procedures
- Cost implications and rollback procedures

**Use this for:** Understanding the technical details and choosing the right implementation approach.

#### [IMPLEMENTATION_CHECKLIST.md](./IMPLEMENTATION_CHECKLIST.md)
Step-by-step checklist for rolling out CPU-based autoscaling:
- Preparation phase tasks
- Staging implementation steps
- Load testing procedures
- Production rollout plan (EU → US → HIPAA)
- Validation and optimization tasks
- Success criteria and timeline

**Use this for:** Project management and tracking implementation progress.

#### [quick-implementation.sh](./quick-implementation.sh)
Bash script for quick implementation of CPU-based autoscaling policies.

**Usage:**
```bash
./quick-implementation.sh <environment> <service-name> [cpu-target]
```

**Examples:**
```bash
# Add CPU-based scaling to staging web service with 70% target
./quick-implementation.sh staging web 70

# Add CPU-based scaling to prod-eu ingestion service with 75% target
./quick-implementation.sh prod-eu web-ingestion 75
```

**Use this for:** Quickly applying CPU-based scaling policies via AWS CLI.

## Quick Start

### For Infrastructure Team

1. **Review the problem:**
   - Read the [ECS_AUTOSCALING_GUIDE.md](./ECS_AUTOSCALING_GUIDE.md) introduction
   - Understand why CPU-based scaling is needed

2. **Choose implementation method:**
   - If using Terraform/CloudFormation: See relevant section in guide
   - If using AWS CLI: Use the `quick-implementation.sh` script
   - If using Console: Follow Console instructions in guide

3. **Follow the checklist:**
   - Use [IMPLEMENTATION_CHECKLIST.md](./IMPLEMENTATION_CHECKLIST.md) to track progress
   - Start with staging environment
   - Roll out gradually to production

### For Monitoring Team

1. Set up CloudWatch dashboards using metrics from the guide
2. Configure alerts for scaling events
3. Monitor for 48 hours after each deployment
4. Document observations in the checklist

### For On-Call Engineers

Key points to know:
- Web services now scale on **CPU OR Request Count** (whichever triggers first)
- CPU target: 70% (scales out when average exceeds this)
- Scale-out cooldown: 60 seconds
- Scale-in cooldown: 300 seconds
- Both policies work independently - removing one doesn't affect the other

## Background

### The Problem

On [recent date], Langfuse experienced high latencies on web containers due to high CPU usage. The containers weren't scaling because:
- Current scaling: Based only on HTTP request count
- Issue: CPU was high, but request count was below threshold
- Result: No scaling triggered → High latency → Service degradation

### The Solution

Implement **mixed scaling criteria**:
- Scale when: `(API requests > threshold) OR (CPU > threshold)`
- AWS ECS supports multiple target tracking policies
- When multiple policies exist, the one requiring more capacity takes precedence
- Result: Scaling happens proactively based on either metric

### Impact

**Before:**
- ❌ CPU spike without request spike = no scaling
- ❌ High latency during CPU constraints
- ❌ Reactive incident response

**After:**
- ✅ CPU spike triggers automatic scaling
- ✅ Proactive resource provisioning
- ✅ Reduced latency and improved reliability

## Additional Resources

### AWS Documentation
- [ECS Service Auto Scaling](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service-auto-scaling.html)
- [Target Tracking Scaling Policies](https://docs.aws.amazon.com/autoscaling/application/userguide/application-auto-scaling-target-tracking.html)
- [ECS CloudWatch Metrics](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/cloudwatch-metrics.html)

### Internal Resources
- Linear Issue: [LFE-7918](https://linear.app/langfuse/issue/LFE-7918)
- Incident Report: [Link to incident report if available]
- CloudWatch Dashboard: [Link to dashboard]

## Rollback

If you need to remove CPU-based scaling:

```bash
aws application-autoscaling delete-scaling-policy \
  --service-namespace ecs \
  --resource-id service/[cluster]/[service] \
  --scalable-dimension ecs:service:DesiredCount \
  --policy-name [service-name]-cpu-tracking-policy
```

The request-based policy will continue operating independently.

## Support

For questions or issues:
1. Check the [ECS_AUTOSCALING_GUIDE.md](./ECS_AUTOSCALING_GUIDE.md) troubleshooting section
2. Review ECS service events in AWS Console
3. Check CloudWatch metrics and alarms
4. Contact the infrastructure team
5. Escalate to AWS Support if needed

---

**Last Updated:** December 2, 2025  
**Maintained By:** Infrastructure Team  
**Related Issue:** LFE-7918
