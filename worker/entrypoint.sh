#!/bin/sh

# Run cleanup script before running migrations
# Check if DATABASE_URL is not set
if [ -z "$DATABASE_URL" ]; then
    # Check if all required variables are provided
    if [ -n "$DATABASE_HOST" ] && [ -n "$DATABASE_USERNAME" ] && [ -n "$DATABASE_PASSWORD" ]  && [ -n "$DATABASE_NAME" ]; then
        # Construct DATABASE_URL from the provided variables
        DATABASE_URL="postgresql://${DATABASE_USERNAME}:${DATABASE_PASSWORD}@${DATABASE_HOST}/${DATABASE_NAME}"
        export DATABASE_URL
    else
        echo "Error: Required database environment variables are not set. Provide a postgres url for DATABASE_URL."
        exit 1
    fi
    if [ -n "$DATABASE_ARGS" ]; then
      # Append ARGS to DATABASE_URL
    	DATABASE_URL="${DATABASE_URL}?$DATABASE_ARGS"
    	export DATABASE_URL
    fi
fi

# On ECS, append task_id:<id> from the container metadata endpoint to DD_TAGS,
# reusing its existing separator (bounded ~2s total; never fails boot)
if [ -n "$ECS_CONTAINER_METADATA_URI_V4" ]; then
    _task_arn=$(timeout 2 wget -T 2 -qO- "${ECS_CONTAINER_METADATA_URI_V4}/task" | sed -n 's/.*"TaskARN"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
    _task_id="${_task_arn##*/}"
    if [ -n "$_task_id" ]; then
        case "$DD_TAGS" in
            *,*) _sep="," ;;
            *" "*) _sep=" " ;;
            *) _sep="," ;;
        esac
        export DD_TAGS="${DD_TAGS:+${DD_TAGS}${_sep}}task_id:${_task_id}"
    fi
fi

# Run the command passed to the docker image on start
exec "$@"
