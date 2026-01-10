#!/bin/bash

# Quick Implementation Script for CPU-Based Autoscaling
# Issue: LFE-7918 - Add CPU based scaling to web containers
#
# This script adds CPU-based autoscaling policies to ECS services
# alongside existing request-based policies.
#
# Prerequisites:
# - AWS CLI installed and configured
# - Appropriate AWS permissions (ecs:*, application-autoscaling:*)
# - Services already have request-based scaling policies
#
# Usage:
#   ./quick-implementation.sh <environment> <service-name> [cpu-target]
#
# Examples:
#   ./quick-implementation.sh staging web 70
#   ./quick-implementation.sh prod-eu web-ingestion 75

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to print usage
usage() {
    cat << EOF
Usage: $0 <environment> <service-name> [cpu-target]

Arguments:
  environment    Environment name (staging, prod-eu, prod-us, prod-hipaa)
  service-name   Service name (web, web-ingestion, web-iso)
  cpu-target     Target CPU percentage (default: 70)

Examples:
  $0 staging web 70
  $0 prod-eu web-ingestion 75
  $0 prod-us web-iso 65

EOF
    exit 1
}

# Check arguments
if [ $# -lt 2 ]; then
    print_error "Insufficient arguments"
    usage
fi

ENVIRONMENT=$1
SERVICE=$2
CPU_TARGET=${3:-70}  # Default to 70% if not specified

# Construct resource identifiers
CLUSTER_NAME="${ENVIRONMENT}-cluster"
SERVICE_NAME="${ENVIRONMENT}-${SERVICE}"
RESOURCE_ID="service/${CLUSTER_NAME}/${SERVICE_NAME}"
POLICY_NAME="${SERVICE_NAME}-cpu-tracking-policy"

# Validate CPU target
if [ "$CPU_TARGET" -lt 50 ] || [ "$CPU_TARGET" -gt 90 ]; then
    print_warn "CPU target ${CPU_TARGET}% is outside recommended range (50-90%)"
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

print_info "Configuration:"
echo "  Environment:  ${ENVIRONMENT}"
echo "  Service:      ${SERVICE_NAME}"
echo "  Cluster:      ${CLUSTER_NAME}"
echo "  CPU Target:   ${CPU_TARGET}%"
echo "  Policy Name:  ${POLICY_NAME}"
echo ""

# Confirm before proceeding
read -p "Proceed with implementation? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    print_info "Aborted by user"
    exit 0
fi

# Check if service exists
print_info "Verifying service exists..."
if ! aws ecs describe-services \
    --cluster "${CLUSTER_NAME}" \
    --services "${SERVICE_NAME}" \
    --query 'services[0].serviceName' \
    --output text 2>/dev/null | grep -q "${SERVICE_NAME}"; then
    print_error "Service ${SERVICE_NAME} not found in cluster ${CLUSTER_NAME}"
    exit 1
fi
print_info "Service verified"

# Check if scalable target exists
print_info "Checking for existing scalable target..."
if ! aws application-autoscaling describe-scalable-targets \
    --service-namespace ecs \
    --resource-ids "${RESOURCE_ID}" \
    --scalable-dimension ecs:service:DesiredCount \
    --query 'ScalableTargets[0].ResourceId' \
    --output text 2>/dev/null | grep -q "service"; then
    print_error "No scalable target found for ${RESOURCE_ID}"
    print_error "Please ensure auto-scaling is configured for this service first"
    exit 1
fi
print_info "Scalable target found"

# Check if CPU policy already exists
print_info "Checking for existing CPU-based policy..."
if aws application-autoscaling describe-scaling-policies \
    --service-namespace ecs \
    --resource-id "${RESOURCE_ID}" \
    --scalable-dimension ecs:service:DesiredCount \
    --policy-names "${POLICY_NAME}" \
    --query 'ScalingPolicies[0].PolicyName' \
    --output text 2>/dev/null | grep -q "${POLICY_NAME}"; then
    print_warn "CPU-based policy already exists: ${POLICY_NAME}"
    read -p "Update existing policy? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_info "Aborted by user"
        exit 0
    fi
fi

# Create temporary policy configuration file
POLICY_FILE=$(mktemp)
cat > "${POLICY_FILE}" << EOF
{
  "TargetValue": ${CPU_TARGET}.0,
  "PredefinedMetricSpecification": {
    "PredefinedMetricType": "ECSServiceAverageCPUUtilization"
  },
  "ScaleOutCooldown": 60,
  "ScaleInCooldown": 300
}
EOF

print_info "Policy configuration:"
cat "${POLICY_FILE}"
echo ""

# Apply the CPU-based scaling policy
print_info "Applying CPU-based scaling policy..."
if aws application-autoscaling put-scaling-policy \
    --service-namespace ecs \
    --scalable-dimension ecs:service:DesiredCount \
    --resource-id "${RESOURCE_ID}" \
    --policy-name "${POLICY_NAME}" \
    --policy-type TargetTrackingScaling \
    --target-tracking-scaling-policy-configuration file://"${POLICY_FILE}" \
    > /dev/null 2>&1; then
    print_info "Successfully created CPU-based scaling policy: ${POLICY_NAME}"
else
    print_error "Failed to create scaling policy"
    rm -f "${POLICY_FILE}"
    exit 1
fi

# Clean up
rm -f "${POLICY_FILE}"

# Verify the policy was created
print_info "Verifying policy creation..."
sleep 2
if aws application-autoscaling describe-scaling-policies \
    --service-namespace ecs \
    --resource-id "${RESOURCE_ID}" \
    --scalable-dimension ecs:service:DesiredCount \
    --query "ScalingPolicies[?PolicyName=='${POLICY_NAME}']" \
    --output json | grep -q "PolicyName"; then
    print_info "Policy verification successful"
else
    print_error "Policy verification failed"
    exit 1
fi

# List all policies for the service
print_info "All scaling policies for ${SERVICE_NAME}:"
aws application-autoscaling describe-scaling-policies \
    --service-namespace ecs \
    --resource-id "${RESOURCE_ID}" \
    --scalable-dimension ecs:service:DesiredCount \
    --query 'ScalingPolicies[*].[PolicyName,PolicyType]' \
    --output table

# Get CloudWatch alarm names
print_info "Associated CloudWatch alarms:"
aws application-autoscaling describe-scaling-policies \
    --service-namespace ecs \
    --resource-id "${RESOURCE_ID}" \
    --scalable-dimension ecs:service:DesiredCount \
    --query "ScalingPolicies[?PolicyName=='${POLICY_NAME}'].Alarms[*].AlarmName" \
    --output table

# Success message
echo ""
print_info "✅ Implementation complete!"
echo ""
echo "Next steps:"
echo "  1. Monitor CloudWatch metrics for scaling events"
echo "  2. Verify CPU-based scaling triggers at ~${CPU_TARGET}%"
echo "  3. Check ECS service scaling history for activity"
echo "  4. Review CloudWatch alarms for the new policy"
echo ""
echo "Monitoring commands:"
echo "  # View scaling activities"
echo "  aws ecs describe-services --cluster ${CLUSTER_NAME} --services ${SERVICE_NAME} --query 'services[0].events[0:10]'"
echo ""
echo "  # Check current metrics"
echo "  aws cloudwatch get-metric-statistics \\"
echo "    --namespace AWS/ECS \\"
echo "    --metric-name CPUUtilization \\"
echo "    --dimensions Name=ServiceName,Value=${SERVICE_NAME} Name=ClusterName,Value=${CLUSTER_NAME} \\"
echo "    --start-time \$(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \\"
echo "    --end-time \$(date -u +%Y-%m-%dT%H:%M:%S) \\"
echo "    --period 300 \\"
echo "    --statistics Average"
echo ""
echo "Rollback command:"
echo "  aws application-autoscaling delete-scaling-policy \\"
echo "    --service-namespace ecs \\"
echo "    --resource-id ${RESOURCE_ID} \\"
echo "    --scalable-dimension ecs:service:DesiredCount \\"
echo "    --policy-name ${POLICY_NAME}"
echo ""
