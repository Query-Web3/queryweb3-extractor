#!/bin/bash

# Check required commands
if ! command -v pnpm &> /dev/null; then
    echo "Error: pnpm is not installed. Please install pnpm first."
    exit 1
fi

if ! command -v pm2 &> /dev/null; then
    echo "Error: pm2 is not installed. Please install pm2 first."
    exit 1
fi

# Check .env file exists
if [ ! -f .env ]; then
    echo "Error: .env file not found. Please create one from .env.example"
    exit 1
fi

# Check ecosystem file exists
if [ ! -f ecosystem.config.js ]; then
    echo "Error: ecosystem.config.js not found."
    exit 1
fi

# Build the project
if [ ! -f dist/index.min.js ]; then
    echo "Building project..."
    rm -rf dist
    if ! pnpm build; then
        echo "Error: Build failed. Please check the build errors."
        exit 1
    fi
fi

# Start services using PM2 ecosystem
echo "Starting services using PM2 ecosystem..."
mkdir -p logs
pm2 start ecosystem.config.js

echo "Services started successfully. Use following commands to manage:"
echo "  pm2 logs           # View logs"
echo "  pm2 status         # View status"
echo "  pm2 stop all       # Stop all services"
echo "  pm2 restart all    # Restart all services"