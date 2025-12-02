# Terraform Example for ECS Autoscaling

This directory contains a Terraform module example for implementing CPU-based autoscaling alongside request-based autoscaling for ECS services.

## Module Usage

### Basic Example

```hcl
module "web_autoscaling" {
  source = "./modules/ecs-autoscaling"
  
  cluster_name = "prod-eu-cluster"
  service_name = "prod-eu-web"
  
  # Capacity settings
  min_capacity = 2
  max_capacity = 10
  
  # Scaling thresholds
  cpu_target_value     = 70    # Scale when CPU > 70%
  request_target_value = 1000  # Scale when requests/target > 1000
  
  # ALB/Target Group configuration (required for request-based scaling)
  alb_arn_suffix          = "app/prod-alb/abc123"
  target_group_arn_suffix = "targetgroup/prod-tg/def456"
  
  tags = {
    Environment = "production"
    Region      = "eu"
    ManagedBy   = "Terraform"
  }
}
```

### Complete Example for All Web Services

```hcl
# Staging Environment
module "staging_web_autoscaling" {
  source = "./modules/ecs-autoscaling"
  
  cluster_name = "staging-cluster"
  service_name = "staging-web"
  
  min_capacity = 1
  max_capacity = 5
  
  cpu_target_value     = 70
  request_target_value = 500
  
  alb_arn_suffix          = data.aws_lb.staging.arn_suffix
  target_group_arn_suffix = data.aws_lb_target_group.staging_web.arn_suffix
  
  tags = local.staging_tags
}

module "staging_web_ingestion_autoscaling" {
  source = "./modules/ecs-autoscaling"
  
  cluster_name = "staging-cluster"
  service_name = "staging-web-ingestion"
  
  min_capacity = 1
  max_capacity = 5
  
  cpu_target_value     = 70
  request_target_value = 1500
  
  alb_arn_suffix          = data.aws_lb.staging.arn_suffix
  target_group_arn_suffix = data.aws_lb_target_group.staging_ingestion.arn_suffix
  
  tags = local.staging_tags
}

# Production EU Environment
module "prod_eu_web_autoscaling" {
  source = "./modules/ecs-autoscaling"
  
  cluster_name = "prod-eu-cluster"
  service_name = "prod-eu-web"
  
  min_capacity = 2
  max_capacity = 10
  
  cpu_target_value     = 70
  request_target_value = 1000
  
  alb_arn_suffix          = data.aws_lb.prod_eu.arn_suffix
  target_group_arn_suffix = data.aws_lb_target_group.prod_eu_web.arn_suffix
  
  tags = local.prod_eu_tags
}

module "prod_eu_web_ingestion_autoscaling" {
  source = "./modules/ecs-autoscaling"
  
  cluster_name = "prod-eu-cluster"
  service_name = "prod-eu-web-ingestion"
  
  min_capacity = 2
  max_capacity = 15
  
  cpu_target_value     = 70
  request_target_value = 2000
  
  alb_arn_suffix          = data.aws_lb.prod_eu.arn_suffix
  target_group_arn_suffix = data.aws_lb_target_group.prod_eu_ingestion.arn_suffix
  
  tags = local.prod_eu_tags
}

# Production US Environment
module "prod_us_web_autoscaling" {
  source = "./modules/ecs-autoscaling"
  
  cluster_name = "prod-us-cluster"
  service_name = "prod-us-web"
  
  min_capacity = 2
  max_capacity = 10
  
  cpu_target_value     = 70
  request_target_value = 1000
  
  alb_arn_suffix          = data.aws_lb.prod_us.arn_suffix
  target_group_arn_suffix = data.aws_lb_target_group.prod_us_web.arn_suffix
  
  tags = local.prod_us_tags
}

# Production HIPAA Environment
module "prod_hipaa_web_autoscaling" {
  source = "./modules/ecs-autoscaling"
  
  cluster_name = "prod-hipaa-cluster"
  service_name = "prod-hipaa-web"
  
  min_capacity = 2
  max_capacity = 8
  
  cpu_target_value     = 70
  request_target_value = 800
  
  alb_arn_suffix          = data.aws_lb.prod_hipaa.arn_suffix
  target_group_arn_suffix = data.aws_lb_target_group.prod_hipaa_web.arn_suffix
  
  tags = local.prod_hipaa_tags
}
```

### CPU-Only Scaling (No Request Scaling)

```hcl
module "worker_autoscaling" {
  source = "./modules/ecs-autoscaling"
  
  cluster_name = "prod-eu-cluster"
  service_name = "prod-eu-worker"
  
  min_capacity = 1
  max_capacity = 5
  
  # Only CPU-based scaling for worker services
  enable_cpu_scaling     = true
  enable_request_scaling = false
  
  cpu_target_value = 75
  
  # These are not used when request scaling is disabled
  alb_arn_suffix          = ""
  target_group_arn_suffix = ""
  
  tags = {
    Service = "worker"
  }
}
```

## Module Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|----------|
| cluster_name | Name of the ECS cluster | string | - | yes |
| service_name | Name of the ECS service | string | - | yes |
| min_capacity | Minimum number of tasks | number | 2 | no |
| max_capacity | Maximum number of tasks | number | 10 | no |
| cpu_target_value | Target CPU utilization % (50-90) | number | 70 | no |
| request_target_value | Target request count per target | number | 1000 | no |
| alb_arn_suffix | ALB ARN suffix | string | - | yes* |
| target_group_arn_suffix | Target group ARN suffix | string | - | yes* |
| scale_out_cooldown | Seconds between scale-out activities | number | 60 | no |
| scale_in_cooldown | Seconds between scale-in activities | number | 300 | no |
| enable_cpu_scaling | Enable CPU-based autoscaling | bool | true | no |
| enable_request_scaling | Enable request-based autoscaling | bool | true | no |
| tags | Tags to apply to resources | map(string) | {} | no |

\* Required when `enable_request_scaling = true`

## Module Outputs

| Name | Description |
|------|-------------|
| autoscaling_target_id | ID of the autoscaling target |
| cpu_policy_arn | ARN of the CPU-based scaling policy |
| cpu_policy_name | Name of the CPU-based scaling policy |
| request_policy_arn | ARN of the request-based scaling policy |
| request_policy_name | Name of the request-based scaling policy |
| scaling_policies | Summary of configured scaling policies |

## Getting ALB and Target Group ARN Suffixes

You can retrieve these using data sources:

```hcl
data "aws_lb" "main" {
  name = "prod-eu-alb"
}

data "aws_lb_target_group" "web" {
  name = "prod-eu-web-tg"
}

# Use in module
module "autoscaling" {
  # ... other config ...
  alb_arn_suffix          = data.aws_lb.main.arn_suffix
  target_group_arn_suffix = data.aws_lb_target_group.web.arn_suffix
}
```

Or via AWS CLI:

```bash
# Get ALB ARN suffix
aws elbv2 describe-load-balancers \
  --names prod-eu-alb \
  --query 'LoadBalancers[0].LoadBalancerArn' \
  --output text | sed 's/.*app\///'

# Get Target Group ARN suffix
aws elbv2 describe-target-groups \
  --names prod-eu-web-tg \
  --query 'TargetGroups[0].TargetGroupArn' \
  --output text | sed 's/.*targetgroup\///'
```

## Gradual Rollout with Terraform

### Phase 1: Add to Staging

```hcl
# main.tf
module "staging_autoscaling" {
  source = "./modules/ecs-autoscaling"
  # ... configuration ...
}
```

```bash
terraform plan
terraform apply -target=module.staging_autoscaling
```

### Phase 2: Add to Production (one at a time)

```bash
# EU first
terraform apply -target=module.prod_eu_web_autoscaling
# Wait 24 hours, monitor

# Then US
terraform apply -target=module.prod_us_web_autoscaling
# Wait 24 hours, monitor

# Finally HIPAA
terraform apply -target=module.prod_hipaa_web_autoscaling
```

## Monitoring After Deployment

Check the outputs:

```bash
terraform output -module=prod_eu_web_autoscaling
```

View CloudWatch alarms:

```bash
# Get alarm names from Terraform state
POLICY_ARN=$(terraform output -raw -module=prod_eu_web_autoscaling cpu_policy_arn)

# Describe alarms
aws cloudwatch describe-alarms \
  --alarm-name-prefix "TargetTracking-service/prod-eu-cluster/prod-eu-web"
```

## Rollback

To remove CPU-based scaling while keeping request-based scaling:

```hcl
module "prod_eu_web_autoscaling" {
  source = "./modules/ecs-autoscaling"
  # ... other config ...
  
  enable_cpu_scaling = false  # Disable CPU scaling
}
```

```bash
terraform plan
terraform apply -target=module.prod_eu_web_autoscaling
```

## Integration with Existing Infrastructure

If you already have autoscaling configured:

1. **Import existing resources:**
   ```bash
   terraform import module.web_autoscaling.aws_appautoscaling_target.ecs_target \
     service/prod-eu-cluster/prod-eu-web
   ```

2. **Add only CPU policy:**
   ```hcl
   module "web_autoscaling" {
     # ... config ...
     enable_request_scaling = false  # Don't manage existing policy
     enable_cpu_scaling     = true   # Add new CPU policy
   }
   ```

3. **Gradually migrate to full module management**

## Notes

- The module uses target tracking scaling policies
- Multiple policies work independently - AWS uses whichever requires more capacity
- CloudWatch alarms are automatically created by AWS
- Alarm names follow pattern: `TargetTracking-service/[cluster]/[service]-[metric]-[uuid]`
- Both scale-out and scale-in respect cooldown periods
- CPU metric is averaged across all tasks in the service

## Support

For issues or questions:
- Review the parent [README.md](../README.md)
- Check the [ECS_AUTOSCALING_GUIDE.md](../ECS_AUTOSCALING_GUIDE.md)
- Consult Terraform documentation: https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/appautoscaling_policy

---

**Issue:** LFE-7918  
**Last Updated:** December 2, 2025
