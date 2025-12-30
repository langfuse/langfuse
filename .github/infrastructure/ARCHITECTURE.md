# CPU-Based Autoscaling Architecture

## Overview

This document provides visual representations of the autoscaling architecture before and after implementing CPU-based scaling.

## Current Architecture (Before)

```mermaid
graph TB
    subgraph "Load Balancer"
        ALB[Application Load Balancer]
    end
    
    subgraph "ECS Service - Web"
        Task1[Task 1<br/>CPU: 95%]
        Task2[Task 2<br/>CPU: 92%]
    end
    
    subgraph "Auto Scaling"
        ASG[Auto Scaling Policy]
        Metric[Request Count<br/>Per Target]
    end
    
    subgraph "CloudWatch"
        CW[CloudWatch Alarms]
    end
    
    Users[Users] --> ALB
    ALB --> Task1
    ALB --> Task2
    ALB -.->|Requests: 800/target| Metric
    Metric --> ASG
    ASG -.->|No Scaling<br/>Below threshold| CW
    
    style Task1 fill:#ffcccc
    style Task2 fill:#ffcccc
    
    note1[High CPU but requests<br/>below threshold = No scaling!]
    style note1 fill:#ffe6e6,stroke:#ff0000
```

**Problem:** Tasks are at 90%+ CPU, but request count (800/target) is below threshold (1000/target), so **no scaling occurs**. This leads to high latency and potential service degradation.

## New Architecture (After)

```mermaid
graph TB
    subgraph "Load Balancer"
        ALB[Application Load Balancer]
    end
    
    subgraph "ECS Service - Web"
        Task1[Task 1<br/>CPU: 72%]
        Task2[Task 2<br/>CPU: 68%]
        Task3[Task 3<br/>CPU: 69%]
        Task4[Task 4<br/>CPU: 71%]
    end
    
    subgraph "Auto Scaling Policies"
        ASG[Auto Scaling Target]
        Policy1[Policy 1:<br/>Request Count]
        Policy2[Policy 2:<br/>CPU Utilization]
    end
    
    subgraph "CloudWatch"
        CW1[Alarm: Requests]
        CW2[Alarm: CPU]
    end
    
    Users[Users] --> ALB
    ALB --> Task1
    ALB --> Task2
    ALB --> Task3
    ALB --> Task4
    
    ALB -.->|Requests| Policy1
    Task1 & Task2 & Task3 & Task4 -.->|CPU Metrics| Policy2
    
    Policy1 --> ASG
    Policy2 --> ASG
    
    Policy1 -.-> CW1
    Policy2 -.-> CW2
    
    ASG -->|Scale Out/In| ECS[ECS Service]
    
    style Task1 fill:#ccffcc
    style Task2 fill:#ccffcc
    style Task3 fill:#ccffcc
    style Task4 fill:#ccffcc
    
    note2[CPU exceeds 70% OR<br/>requests exceed 1000 = Scaling!]
    style note2 fill:#e6ffe6,stroke:#00ff00
```

**Solution:** When CPU hit 70%, Policy 2 triggered scaling, adding Tasks 3 and 4. CPU is now distributed across more tasks, staying around the 70% target. Service remains responsive even under CPU-intensive workloads.

## Scaling Decision Flow

```mermaid
graph LR
    Start([Load Increases]) --> Check{Check Metrics}
    
    Check -->|CPU > 70%| CPU[CPU Policy<br/>Triggers]
    Check -->|Requests > 1000| REQ[Request Policy<br/>Triggers]
    Check -->|Both High| BOTH[Both Policies<br/>Trigger]
    
    CPU --> Scale[Scale Out]
    REQ --> Scale
    BOTH --> Scale
    
    Scale --> Add[Add Tasks]
    Add --> Distribute[Distribute Load]
    Distribute --> Monitor{Monitor Metrics}
    
    Monitor -->|Still High| Scale
    Monitor -->|Normal| Cooldown[Cooldown Period]
    Cooldown --> Done([Stable State])
    
    style CPU fill:#ffcccc
    style REQ fill:#ccccff
    style BOTH fill:#ffccff
    style Scale fill:#ccffcc
    style Done fill:#ccffcc
```

## Policy Interaction Diagram

```mermaid
sequenceDiagram
    participant Users
    participant ALB
    participant ECS as ECS Tasks
    participant Policy1 as Request Policy
    participant Policy2 as CPU Policy
    participant ASG as Auto Scaling
    participant CW as CloudWatch
    
    Note over ECS: Current: 2 tasks, CPU 40%
    
    Users->>ALB: Heavy computational requests
    ALB->>ECS: Route traffic
    
    ECS->>CW: CPU: 55%
    ECS->>CW: CPU: 65%
    ECS->>CW: CPU: 75% ⚠️
    
    CW->>Policy2: Alarm: CPU > 70%
    Policy2->>ASG: Request scale out
    ASG->>ECS: Add 1 task
    
    Note over ECS: Now: 3 tasks, CPU ~68%
    
    ECS->>CW: CPU: 68%
    ECS->>CW: CPU: 66%
    
    Note over Policy2: Cooldown: 60s
    
    Users->>ALB: Traffic decreases
    
    ECS->>CW: CPU: 50%
    ECS->>CW: CPU: 45%
    
    Note over Policy2: Wait 300s cooldown
    
    CW->>Policy2: CPU consistently low
    Policy2->>ASG: Request scale in
    ASG->>ECS: Remove 1 task
    
    Note over ECS: Back to: 2 tasks, CPU ~55%
```

## Multi-Region Deployment Architecture

```mermaid
graph TB
    subgraph "EU Region"
        ALB_EU[ALB EU]
        
        subgraph "Cluster: prod-eu-cluster"
            Web_EU[Service: web]
            Ing_EU[Service: web-ingestion]
            ISO_EU[Service: web-iso]
        end
        
        AS_EU[Auto Scaling<br/>Request + CPU]
    end
    
    subgraph "US Region"
        ALB_US[ALB US]
        
        subgraph "Cluster: prod-us-cluster"
            Web_US[Service: web]
            Ing_US[Service: web-ingestion]
            ISO_US[Service: web-iso]
        end
        
        AS_US[Auto Scaling<br/>Request + CPU]
    end
    
    subgraph "HIPAA Region"
        ALB_HIPAA[ALB HIPAA]
        
        subgraph "Cluster: prod-hipaa-cluster"
            Web_HIPAA[Service: web]
            Ing_HIPAA[Service: web-ingestion]
            ISO_HIPAA[Service: web-iso]
        end
        
        AS_HIPAA[Auto Scaling<br/>Request + CPU]
    end
    
    ALB_EU --> Web_EU & Ing_EU & ISO_EU
    Web_EU & Ing_EU & ISO_EU -.-> AS_EU
    
    ALB_US --> Web_US & Ing_US & ISO_US
    Web_US & Ing_US & ISO_US -.-> AS_US
    
    ALB_HIPAA --> Web_HIPAA & Ing_HIPAA & ISO_HIPAA
    Web_HIPAA & Ing_HIPAA & ISO_HIPAA -.-> AS_HIPAA
    
    style Web_EU fill:#ccffcc
    style Ing_EU fill:#ccffcc
    style ISO_EU fill:#ccffcc
    style Web_US fill:#ccffcc
    style Ing_US fill:#ccffcc
    style ISO_US fill:#ccffcc
    style Web_HIPAA fill:#ccffcc
    style Ing_HIPAA fill:#ccffcc
    style ISO_HIPAA fill:#ccffcc
```

**Note:** Each service in each region gets both CPU-based and request-based scaling policies.

## Scaling Policy Configuration

```mermaid
graph LR
    subgraph "Service: prod-eu-web"
        Target[Scalable Target<br/>Min: 2, Max: 10]
    end
    
    subgraph "Policy 1: Requests"
        Req_Metric[Metric:<br/>ALBRequestCountPerTarget]
        Req_Target[Target: 1000]
        Req_Cooldown_Out[Scale-out: 60s]
        Req_Cooldown_In[Scale-in: 300s]
    end
    
    subgraph "Policy 2: CPU"
        CPU_Metric[Metric:<br/>ECSServiceAverageCPUUtilization]
        CPU_Target[Target: 70%]
        CPU_Cooldown_Out[Scale-out: 60s]
        CPU_Cooldown_In[Scale-in: 300s]
    end
    
    subgraph "CloudWatch Alarms"
        Alarm_Req_High[Alarm: Requests High]
        Alarm_Req_Low[Alarm: Requests Low]
        Alarm_CPU_High[Alarm: CPU High]
        Alarm_CPU_Low[Alarm: CPU Low]
    end
    
    Target --> Req_Metric & CPU_Metric
    
    Req_Metric --> Req_Target
    Req_Target --> Req_Cooldown_Out
    Req_Target --> Req_Cooldown_In
    Req_Cooldown_Out & Req_Cooldown_In --> Alarm_Req_High & Alarm_Req_Low
    
    CPU_Metric --> CPU_Target
    CPU_Target --> CPU_Cooldown_Out
    CPU_Target --> CPU_Cooldown_In
    CPU_Cooldown_Out & CPU_Cooldown_In --> Alarm_CPU_High & Alarm_CPU_Low
    
    style Target fill:#e6f3ff
    style Req_Metric fill:#fff0e6
    style CPU_Metric fill:#ffe6e6
```

## Monitoring Dashboard Layout

```
┌─────────────────────────────────────────────────────────────┐
│                  ECS Autoscaling Dashboard                  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────┐  ┌──────────────────┐               │
│  │  CPU Utilization │  │  Task Count     │               │
│  │                  │  │                  │               │
│  │  [Line Chart]    │  │  [Line Chart]    │               │
│  │  Target: 70%     │  │  Min: 2, Max: 10 │               │
│  └──────────────────┘  └──────────────────┘               │
│                                                              │
│  ┌──────────────────┐  ┌──────────────────┐               │
│  │  Requests/Target │  │  Response Time   │               │
│  │                  │  │                  │               │
│  │  [Line Chart]    │  │  [Line Chart]    │               │
│  │  Target: 1000    │  │  P95, P99        │               │
│  └──────────────────┘  └──────────────────┘               │
│                                                              │
│  ┌─────────────────────────────────────────┐               │
│  │      Scaling Events Timeline            │               │
│  │                                          │               │
│  │  [Timeline showing scale-out/in events]  │               │
│  │  Color-coded: CPU vs Request triggered  │               │
│  └─────────────────────────────────────────┘               │
│                                                              │
│  ┌──────────────────┐  ┌──────────────────┐               │
│  │  5xx Errors      │  │  Cost Estimate   │               │
│  │                  │  │                  │               │
│  │  [Bar Chart]     │  │  [Number]        │               │
│  │                  │  │  Task-hours/day  │               │
│  └──────────────────┘  └──────────────────┘               │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Cost Comparison

### Before CPU-Based Scaling

```
┌─────────────────────────────────────────┐
│  Time  │ CPU │ Tasks │ Requests │ State │
├────────┼─────┼───────┼──────────┼───────┤
│  00:00 │ 40% │   2   │   800    │  ✓    │
│  01:00 │ 50% │   2   │   900    │  ✓    │
│  02:00 │ 95% │   2   │   850    │  ⚠️   │ <- High latency!
│  03:00 │ 92% │   2   │   880    │  ⚠️   │ <- Still no scale
│  04:00 │ 45% │   2   │   700    │  ✓    │
└─────────────────────────────────────────┘

Average Tasks: 2
Task-hours: 48/day
Customer Impact: High latency 02:00-03:00
```

### After CPU-Based Scaling

```
┌─────────────────────────────────────────┐
│  Time  │ CPU │ Tasks │ Requests │ State │
├────────┼─────┼───────┼──────────┼───────┤
│  00:00 │ 40% │   2   │   800    │  ✓    │
│  01:00 │ 50% │   2   │   900    │  ✓    │
│  02:00 │ 72% │   3   │   850    │  ✓    │ <- Scaled up!
│  03:00 │ 68% │   3   │   880    │  ✓    │ <- Stable
│  04:00 │ 45% │   2   │   700    │  ✓    │ <- Scaled back
└─────────────────────────────────────────┘

Average Tasks: 2.2
Task-hours: 53/day (+10%)
Customer Impact: None - proactive scaling
```

**Cost Impact:** +10% task-hours, but prevented incident and maintained SLA.

## Implementation Timeline

```mermaid
gantt
    title CPU-Based Autoscaling Implementation
    dateFormat YYYY-MM-DD
    section Preparation
    Review docs           :a1, 2025-12-02, 2d
    Setup monitoring      :a2, after a1, 2d
    
    section Staging
    Deploy to staging     :b1, after a2, 1d
    Monitor staging       :b2, after b1, 3d
    
    section Testing
    Load test prep        :c1, after b2, 1d
    Execute tests         :c2, after c1, 2d
    Analyze results       :c3, after c2, 2d
    
    section Production
    Deploy prod-eu        :d1, after c3, 1d
    Monitor prod-eu       :d2, after d1, 1d
    Deploy prod-us        :d3, after d2, 1d
    Monitor prod-us       :d4, after d3, 1d
    Deploy prod-hipaa     :d5, after d4, 1d
    Monitor prod-hipaa    :d6, after d5, 1d
    
    section Validation
    Performance analysis  :e1, after d6, 3d
    Cost analysis         :e2, after d6, 3d
    Documentation         :e3, after e1, 2d
```

## Key Takeaways

1. **Dual Protection:** Both CPU and request-based policies protect against different failure modes
2. **Independent Operation:** Policies work independently - removing one doesn't affect the other
3. **Quick Response:** 60-second scale-out cooldown ensures fast response to load increases
4. **Stable Operation:** 300-second scale-in cooldown prevents flapping
5. **Cost Efficient:** ~10% cost increase provides significant reliability improvement
6. **Easy Rollback:** Single command removes CPU policy if needed

---

**Visual Guide for:** LFE-7918 - Add CPU based scaling to web containers  
**Last Updated:** December 2, 2025
