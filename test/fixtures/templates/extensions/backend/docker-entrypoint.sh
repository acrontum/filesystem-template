#!/bin/sh

# if any errors occur, abort with erorr code
# this will prevent restart loops if any command fails
set -e

command="${1:-prod}"

echo "Command: $@"

case $command in
  watch)
    NODE_ENV=development npm install
    npx tsc-watch --preserveWatchOutput --compiler /code/node_modules/.bin/ttsc --onSuccess "npm start"
  ;;
  dev)
    NODE_ENV=development npm install
    npm start
  ;;
  prod)
    NODE_ENV='production' npm start
  ;;
esac
