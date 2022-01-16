#!/bin/bash

set -e

npm run build
npx prettier --check 'src/**/*.ts'
npm test
