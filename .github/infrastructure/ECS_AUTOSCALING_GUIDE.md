# ECS Autoscaling Configuration Guide

## Overview

This document provides guidance on implementing mixed autoscaling metrics for Langfuse web containers on AWS ECS. The goal is to scale based on either HTTP request count OR CPU utilization to prevent high latency issues caused by CPU constraints.

## Problem Statement

Currently, web containers scale based solely on HTTP request count. This can lead to situations where CPU usage is high but request count hasn't reached the threshold, resulting in high latencies and degraded performance.

## Solution

Implement **multiple target tracking scaling policies** on ECS services. AWS ECS Application Auto Scaling supports multiple scaling policies, and when multiple policies are active, the one that provides the most capacity will be used.

## Implementation Options

### Option 1: AWS Console Configuration

1. Navigate to ECS Console → Clusters → [cluster-name] → Services → [service-name]
2. Go to "Auto Scaling" tab
3. Add a new scaling policy with the following settings:

**Policy 1: Request Count Based (existing)**
- Policy type: Target tracking
- ECS service metric: ALBRequestCountPerTarget
- Target value: [current threshold, e.g., 1000]
- Scale-out cooldown: 60 seconds
- Scale-in cooldown: 300 seconds

**Policy 2: CPU Based (new)**
- Policy type: Target tracking
- ECS service metric: ECSServiceAverageCPUUtilization
- Target value: 70 (adjust based on workload)
- Scale-out cooldown: 60 seconds
- Scale-in cooldown: 300 seconds

### Option 2: AWS CLI Configuration

```bash
# Policy 1: Request-based scaling
aws application-autoscaling put-scaling-policy \
  --service-namespace ecs \
  --scalable-dimension ecs:service:DesiredCount \
  --resource-id service/[cluster-name]/[service-name] \
  --policy-name request-count-tracking-policy \
  --policy-type TargetTrackingScaling \
  --target-tracking-scaling-policy-configuration file://request-scaling-policy.json

# Policy 2: CPU-based scaling  
aws application-autoscaling put-scaling-policy \
  --service-namespace ecs \
  --scalable-dimension ecs:service:DesiredCount \
  --resource-id service/[cluster-name]/[service-name] \
  --policy-name cpu-tracking-policy \
  --policy-type TargetTrackingScaling \
  --target-tracking-scaling-policy-configuration file://cpu-scaling-policy.json
```

**request-scaling-policy.json:**
```json
{
  "TargetValue": 1000.0,
  "PredefinedMetricSpecification": {
    "PredefinedMetricType": "ALBRequestCountPerTarget",
    "ResourceLabel": "app/[alb-name]/[alb-id]/targetgroup/[tg-name]/[tg-id]"
  },
  "ScaleOutCooldown": 60,
  "ScaleInCooldown": 300
}
```

**cpu-scaling-policy.json:**
```json
{
  "TargetValue": 70.0,
  "PredefinedMetricSpecification": {
    "PredefinedMetricType": "ECSServiceAverageCPUUtilization"
  },
  "ScaleOutCooldown": 60,
  "ScaleInCooldown": 300
}
```

### Option 3: Terraform Configuration

```hcl
# Auto Scaling Target
resource "aws_appautoscaling_target" "ecs_target" {
  max_capacity       = 10
  min_capacity       = 2
  resource_id        = "service/${var.cluster_name}/${var.service_name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

# Request-based scaling policy
resource "aws_appautoscaling_policy" "ecs_request_policy" {
  name               = "${var.service_name}-request-tracking-policy"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ecs_target.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs_target.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs_target.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ALBRequestCountPerTarget"
      resource_label         = "${var.alb_arn_suffix}/${var.target_group_arn_suffix}"
    }
    target_value       = 1000.0
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}

# CPU-based scaling policy
resource "aws_appautoscaling_policy" "ecs_cpu_policy" {
  name               = "${var.service_name}-cpu-tracking-policy"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ecs_target.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs_target.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs_target.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value       = 70.0
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}
```

### Option 4: CloudFormation Configuration

```yaml
Resources:
  ECSServiceScalingTarget:
    Type: AWS::ApplicationAutoScaling::ScalableTarget
    Properties:
      MaxCapacity: 10
      MinCapacity: 2
      ResourceId: !Sub service/${ClusterName}/${ServiceName}
      RoleARN: !GetAtt AutoScalingRole.Arn
      ScalableDimension: ecs:service:DesiredCount
      ServiceNamespace: ecs

  ECSRequestScalingPolicy:
    Type: AWS::ApplicationAutoScaling::ScalingPolicy
    Properties:
      PolicyName: !Sub ${ServiceName}-request-tracking-policy
      PolicyType: TargetTrackingScaling
      ScalingTargetId: !Ref ECSServiceScalingTarget
      TargetTrackingScalingPolicyConfiguration:
        PredefinedMetricSpecification:
          PredefinedMetricType: ALBRequestCountPerTarget
          ResourceLabel: !Sub 
            - ${ALBArn}/${TargetGroupArn}
            - ALBArn: !GetAtt LoadBalancer.LoadBalancerFullName
              TargetGroupArn: !GetAtt TargetGroup.TargetGroupFullName
        TargetValue: 1000.0
        ScaleInCooldown: 300
        ScaleOutCooldown: 60

  ECSCPUScalingPolicy:
    Type: AWS::ApplicationAutoScaling::ScalingPolicy
    Properties:
      PolicyName: !Sub ${ServiceName}-cpu-tracking-policy
      PolicyType: TargetTrackingScaling
      ScalingTargetId: !Ref ECSServiceScalingTarget
      TargetTrackingScalingPolicyConfiguration:
        PredefinedMetricSpecification:
          PredefinedMetricType: ECSServiceAverageCPUUtilization
        TargetValue: 70.0
        ScaleInCooldown: 300
        ScaleOutCooldown: 60
```

## Configuration Parameters

### CPU Target Value Recommendations

| Workload Type | Recommended CPU Target | Notes |
|---------------|----------------------|-------|
| Latency-sensitive APIs | 50-60% | More headroom for spikes |
| Standard web services | 70-75% | Balanced approach |
| Batch/Background | 80-85% | Cost-optimized |

For Langfuse web containers, we recommend starting with **70%** and adjusting based on monitoring.

### Cooldown Periods

- **Scale-out cooldown**: 60 seconds (fast response to increased load)
- **Scale-in cooldown**: 300 seconds (prevent flapping, allow for traffic variations)

### Min/Max Capacity

Set appropriate boundaries based on:
- Minimum capacity: Enough to handle baseline traffic
- Maximum capacity: Budget constraints and infrastructure limits

## Services to Configure

Apply these policies to the following services:

1. **web** (staging-web, prod-eu-web, prod-us-web, prod-hipaa-web)
2. **web-ingestion** (staging-web-ingestion, prod-eu-web-ingestion, etc.)
3. **web-iso** (if applicable)

Note: The **worker** service may have different scaling requirements and should be evaluated separately.

## Monitoring and Validation

After implementing CPU-based scaling, monitor these CloudWatch metrics:

1. **ECS Service Metrics:**
   - `CPUUtilization` - Should stay around target value
   - `DesiredCount` vs `RunningCount` - Verify scaling actions
   - `TargetResponseTime` - Should improve with better scaling

2. **ALB Metrics:**
   - `TargetResponseTime` - Watch for improvements
   - `RequestCountPerTarget` - Understand traffic patterns
   - `HTTPCode_Target_5XX_Count` - Should decrease

3. **Auto Scaling Activity:**
   - Review scaling activities in ECS console
   - Check CloudWatch Alarms for scaling policies
   - Monitor scaling policy behaviors in CloudWatch Insights

### Example CloudWatch Insights Query

```sql
fields @timestamp, detail.requestedTaskCount, detail.desiredCount, detail.runningCount
| filter eventName = "UpdateService"
| filter detail.serviceName like /web/
| sort @timestamp desc
| limit 100
```

## Testing Plan

1. **Baseline Measurement:**
   - Document current CPU utilization patterns
   - Record current request count thresholds
   - Note p50, p95, p99 latencies

2. **Gradual Rollout:**
   - Start with staging environment
   - Monitor for 48 hours
   - Verify scaling behavior under various load conditions
   - Roll out to production environments one region at a time

3. **Load Testing:**
   - Simulate high CPU scenarios
   - Verify scaling triggers at expected thresholds
   - Ensure scale-in behavior is appropriate

4. **Alert Tuning:**
   - Adjust CloudWatch alarms for new scaling behavior
   - Set up alerts for scaling failures
   - Monitor cost implications

## Rollback Plan

If issues arise:

1. Disable the CPU-based scaling policy via AWS Console or CLI:
   ```bash
   aws application-autoscaling delete-scaling-policy \
     --service-namespace ecs \
     --scalable-dimension ecs:service:DesiredCount \
     --resource-id service/[cluster-name]/[service-name] \
     --policy-name cpu-tracking-policy
   ```

2. The request-based policy will continue operating independently

3. Re-evaluate CPU target thresholds and test in staging

## Cost Implications

**Expected Changes:**
- More responsive scaling may lead to slightly higher average container count
- Improved performance reduces risk of service degradation
- Better resource utilization can offset cost increases
- Prevented incidents (like the recent high latency event) justify the investment

**Cost Monitoring:**
- Track ECS task hours before and after implementation
- Monitor average running task count
- Compare cost vs. performance improvements

## References

- [AWS ECS Auto Scaling Documentation](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service-auto-scaling.html)
- [Target Tracking Scaling Policies](https://docs.aws.amazon.com/autoscaling/application/userguide/application-auto-scaling-target-tracking.html)
- [ECS CloudWatch Metrics](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/cloudwatch-metrics.html)

## Next Steps

1. ✅ Review this document with the infrastructure team
2. ⬜ Identify the current IaC tool/location (Terraform/CloudFormation/CDK)
3. ⬜ Implement CPU-based scaling in staging environment
4. ⬜ Monitor staging for 48 hours
5. ⬜ Roll out to production environments (EU → US → HIPAA)
6. ⬜ Update runbooks and incident response procedures
7. ⬜ Schedule review after 1 week of production operation

## Questions?

For questions or issues with this implementation:
- Check ECS service auto scaling logs in CloudWatch
- Review ECS service events in the AWS Console
- Consult AWS Support if scaling policies aren't behaving as expected
