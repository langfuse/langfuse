#!/bin/sh

prisma migrate deploy
node cron.js &
node server.js
