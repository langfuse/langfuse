# Terraform Module for ECS Autoscaling with CPU-based policies
# Issue: LFE-7918 - Add CPU based scaling to web containers
#
# This module configures mixed autoscaling (Request Count + CPU) for ECS services
# 
# Usage:
#   module "web_autoscaling" {
#     source = "./modules/ecs-autoscaling"
#     
#     cluster_name  = "prod-eu-cluster"
#     service_name  = "prod-eu-web"
#     
#     min_capacity = 2
#     max_capacity = 10
#     
#     cpu_target_value     = 70
#     request_target_value = 1000
#     
#     alb_arn_suffix         = "app/prod-alb/abc123"
#     target_group_arn_suffix = "targetgroup/prod-tg/def456"
#   }

terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 4.0"
    }
  }
}

# Variables
variable "cluster_name" {
  description = "Name of the ECS cluster"
  type        = string
}

variable "service_name" {
  description = "Name of the ECS service"
  type        = string
}

variable "min_capacity" {
  description = "Minimum number of tasks"
  type        = number
  default     = 2
}

variable "max_capacity" {
  description = "Maximum number of tasks"
  type        = number
  default     = 10
}

variable "cpu_target_value" {
  description = "Target CPU utilization percentage (50-90)"
  type        = number
  default     = 70

  validation {
    condition     = var.cpu_target_value >= 50 && var.cpu_target_value <= 90
    error_message = "CPU target value must be between 50 and 90."
  }
}

variable "request_target_value" {
  description = "Target request count per target"
  type        = number
  default     = 1000
}

variable "alb_arn_suffix" {
  description = "ALB ARN suffix (e.g., app/my-alb/1234567890)"
  type        = string
}

variable "target_group_arn_suffix" {
  description = "Target group ARN suffix (e.g., targetgroup/my-tg/1234567890)"
  type        = string
}

variable "scale_out_cooldown" {
  description = "Seconds between scale-out activities"
  type        = number
  default     = 60
}

variable "scale_in_cooldown" {
  description = "Seconds between scale-in activities"
  type        = number
  default     = 300
}

variable "enable_cpu_scaling" {
  description = "Enable CPU-based autoscaling"
  type        = bool
  default     = true
}

variable "enable_request_scaling" {
  description = "Enable request-based autoscaling"
  type        = bool
  default     = true
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default     = {}
}

# Auto Scaling Target
resource "aws_appautoscaling_target" "ecs_target" {
  max_capacity       = var.max_capacity
  min_capacity       = var.min_capacity
  resource_id        = "service/${var.cluster_name}/${var.service_name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"

  tags = merge(
    var.tags,
    {
      Name        = "${var.service_name}-autoscaling-target"
      Service     = var.service_name
      Cluster     = var.cluster_name
      ManagedBy   = "Terraform"
      Issue       = "LFE-7918"
    }
  )
}

# Request-based scaling policy
resource "aws_appautoscaling_policy" "ecs_request_policy" {
  count = var.enable_request_scaling ? 1 : 0

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

    target_value       = var.request_target_value
    scale_in_cooldown  = var.scale_in_cooldown
    scale_out_cooldown = var.scale_out_cooldown
  }
}

# CPU-based scaling policy
resource "aws_appautoscaling_policy" "ecs_cpu_policy" {
  count = var.enable_cpu_scaling ? 1 : 0

  name               = "${var.service_name}-cpu-tracking-policy"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ecs_target.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs_target.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs_target.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }

    target_value       = var.cpu_target_value
    scale_in_cooldown  = var.scale_in_cooldown
    scale_out_cooldown = var.scale_out_cooldown
  }
}

# Outputs
output "autoscaling_target_id" {
  description = "ID of the autoscaling target"
  value       = aws_appautoscaling_target.ecs_target.id
}

output "cpu_policy_arn" {
  description = "ARN of the CPU-based scaling policy"
  value       = var.enable_cpu_scaling ? aws_appautoscaling_policy.ecs_cpu_policy[0].arn : null
}

output "cpu_policy_name" {
  description = "Name of the CPU-based scaling policy"
  value       = var.enable_cpu_scaling ? aws_appautoscaling_policy.ecs_cpu_policy[0].name : null
}

output "request_policy_arn" {
  description = "ARN of the request-based scaling policy"
  value       = var.enable_request_scaling ? aws_appautoscaling_policy.ecs_request_policy[0].arn : null
}

output "request_policy_name" {
  description = "Name of the request-based scaling policy"
  value       = var.enable_request_scaling ? aws_appautoscaling_policy.ecs_request_policy[0].name : null
}

output "scaling_policies" {
  description = "Summary of configured scaling policies"
  value = {
    cpu_enabled     = var.enable_cpu_scaling
    request_enabled = var.enable_request_scaling
    cpu_target      = var.cpu_target_value
    request_target  = var.request_target_value
    min_capacity    = var.min_capacity
    max_capacity    = var.max_capacity
  }
}
