#!/bin/bash
# Standard way to run docker-compose commands in this project
# Automatically loads server/.env for Docker Compose variable substitution
# Usage: ./docker-compose.sh [docker-compose arguments]
# Example: ./docker-compose.sh up -d --build
# Example: ./docker-compose.sh -f docker-compose.prod.yml up -d

if [ ! -f "server/.env" ]; then
    echo "Error: server/.env not found"
    echo "Please create server/.env from server/.env.example"
    exit 1
fi

# Source server/.env and export all variables for Docker Compose variable substitution
# Docker Compose variable substitution only reads from shell environment or root .env file
set -a
source server/.env
set +a

# Run docker-compose with the environment variables loaded
exec docker-compose "$@"
