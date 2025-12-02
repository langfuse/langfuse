# LFE-7918: CPU-Based Scaling - Implementation Ready

## Status Update

✅ **Documentation and tooling complete** - Ready for implementation

## What Was Created

I've created comprehensive documentation and tooling to implement CPU-based autoscaling for web containers:

### 📚 Documentation
1. **[ECS Autoscaling Guide](https://github.com/langfuse/langfuse/blob/main/.github/infrastructure/ECS_AUTOSCALING_GUIDE.md)** - Complete technical guide with multiple implementation options
2. **[Implementation Checklist](https://github.com/langfuse/langfuse/blob/main/.github/infrastructure/IMPLEMENTATION_CHECKLIST.md)** - Step-by-step rollout plan with timeline
3. **[Summary](https://github.com/langfuse/langfuse/blob/main/.github/infrastructure/SUMMARY.md)** - Executive overview and quick reference

### 🛠️ Tools
1. **[Quick Implementation Script](https://github.com/langfuse/langfuse/blob/main/.github/infrastructure/quick-implementation.sh)** - Bash script for AWS CLI deployment
2. **[Terraform Module](https://github.com/langfuse/langfuse/tree/main/.github/infrastructure/terraform-example)** - Reusable IaC module

## The Solution

**Problem:** Recent high latency incident caused by high CPU usage. Current autoscaling only considers HTTP request count.

**Solution:** Add CPU-based autoscaling alongside request-based scaling. Scale when `(requests > threshold) OR (CPU > threshold)`.

```
┌─────────────┐     ┌─────────────┐
│  HTTP       │     │     CPU     │
│  Requests   │     │ Utilization │
└─────────────┘     └─────────────┘
      │                    │
      ├────────OR──────────┤
      └──> Scale Up if either triggers
```

**Configuration:**
- CPU Target: 70% (configurable)
- Scale-out: 60 seconds cooldown
- Scale-in: 300 seconds cooldown
- Works independently with existing request-based scaling

## Quick Start

Choose your implementation method:

### Option 1: AWS CLI (Fastest)
```bash
cd .github/infrastructure
./quick-implementation.sh staging web 70
```

### Option 2: Terraform
```hcl
module "web_autoscaling" {
  source = "./terraform-example"
  
  cluster_name         = "staging-cluster"
  service_name         = "staging-web"
  cpu_target_value     = 70
  # ... see terraform-example/README.md
}
```

### Option 3: AWS Console
Follow step-by-step instructions in [ECS_AUTOSCALING_GUIDE.md](https://github.com/langfuse/langfuse/blob/main/.github/infrastructure/ECS_AUTOSCALING_GUIDE.md#option-1-aws-console-configuration)

## Rollout Plan

**Timeline:** 3-4 weeks

1. **Week 1:** Staging implementation + monitoring
2. **Week 2:** Load testing and validation
3. **Week 3:** Production rollout (EU → US → HIPAA)
4. **Week 4:** Validation and optimization

**Services to configure:**
- staging: web, web-ingestion, web-iso
- prod-eu: web, web-ingestion, web-iso
- prod-us: web, web-ingestion, web-iso
- prod-hipaa: web, web-ingestion, web-iso

## Success Criteria

✅ CPU-based scaling policies active on all web services  
✅ No service disruptions during implementation  
✅ Scaling triggers at expected CPU threshold (70% ± 5%)  
✅ Improved P95/P99 latencies under high CPU load  
✅ Cost increase < 10%  

## Next Steps

1. **This week:**
   - [ ] Infrastructure team reviews documentation
   - [ ] Identify IaC tool/location (Terraform/CloudFormation/CLI)
   - [ ] Set up monitoring dashboard
   - [ ] Deploy to staging

2. **Next sprint:**
   - [ ] Complete load testing
   - [ ] Begin production rollout

## Rollback

If issues occur, one-command rollback:
```bash
aws application-autoscaling delete-scaling-policy \
  --service-namespace ecs \
  --resource-id service/[cluster]/[service] \
  --scalable-dimension ecs:service:DesiredCount \
  --policy-name [service]-cpu-tracking-policy
```

Request-based scaling continues operating independently.

## Resources

All documentation in `.github/infrastructure/`:
- [README.md](https://github.com/langfuse/langfuse/blob/main/.github/infrastructure/README.md) - Start here
- [ECS_AUTOSCALING_GUIDE.md](https://github.com/langfuse/langfuse/blob/main/.github/infrastructure/ECS_AUTOSCALING_GUIDE.md) - Technical details
- [IMPLEMENTATION_CHECKLIST.md](https://github.com/langfuse/langfuse/blob/main/.github/infrastructure/IMPLEMENTATION_CHECKLIST.md) - Task list
- [SUMMARY.md](https://github.com/langfuse/langfuse/blob/main/.github/infrastructure/SUMMARY.md) - Executive summary

## Questions?

See [SUMMARY.md Q&A section](https://github.com/langfuse/langfuse/blob/main/.github/infrastructure/SUMMARY.md#questions--answers) or reach out to infrastructure team.

---

**Ready for implementation** | **Estimated effort:** 3-4 weeks | **Cost impact:** < 10%
