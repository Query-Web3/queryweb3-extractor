#!/bin/bash

set -e

rm -rf node_modules
rm -rf dist
pnpm primsa:generate
pnpm build