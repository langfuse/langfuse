# Trigger System

The trigger system allows users to configure automated actions that execute in response to specific events in the Langfuse platform.

## Architecture Overview

The trigger system consists of three main components:

1. **Trigger Configuration**: Defines when an action should be triggered based on event source and filters
2. **Action Configuration**: Defines what should happen when a trigger fires (e.g., webhook)
3. **Action Execution**: Records of actions that have been executed

## Database Schema

The system uses the following tables in the database:

- `TriggerConfiguration`: Stores trigger definitions including event source, filters, and sampling rate
- `ActionConfiguration`: Stores action definitions including type and configuration
- `ActionExecution`: Records executions of actions including status, input/output, and timestamps

## Event Flow

1. An event occurs in the system (e.g., observation created)
2. The event is processed by a queue processor (e.g., `observationUpsertProcessor`)
3. The ActionCreationService is called with the event and finds all active triggers for the event source
4. For each matching trigger:
   - Checks if the event matches the trigger's filters (lookup depending on event source)
   - Checks if the job exists already. If yes, it skips the creation of a new job. If no match, but job exists, it cancels the job. (Check depends on event source. e.g. `source_id` for `observation.created` is the observation id)
   - Applies sampling if configured
   - Creates an action execution record. Here we convert the trigger (e.g. `observation.created`) + the action configuration in the database to the input of the action.
   - The action is then processed asynchronously

## Supported Event Sources

Currently, the system supports the following event sources:

- `observation.created`: Triggered when a new observation is created

## Supported Actions

Currently, the system supports the following action types:

- **Webhooks**: Send HTTP requests to external endpoints with event data

## Sampling

Triggers can be configured with a sampling rate (0-1) to control how frequently they fire. This is useful for high-volume events where you only want to process a percentage of occurrences.
