#!/bin/bash

set -e

cd "$(cd $(dirname $0) && pwd)/.."

npm run build
npx prettier --check 'src/**/*.ts'
npm test
