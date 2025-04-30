#!/bin/bash

set -e

rm -rf node_modules
pnpm install
rm -rf dist
pnpm build