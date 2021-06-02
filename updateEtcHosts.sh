#!/usr/bin/env bash

# Grab and save the path to this script
# http://stackoverflow.com/a/246128
SOURCE="${BASH_SOURCE[0]}"
while [[ -L "$SOURCE" ]]; do # resolve $SOURCE until the file is no longer a symlink
  DIR="$(cd -P "$(dirname "$SOURCE")" && pwd)"
  SOURCE="$(readlink "$SOURCE")"
  [[ ${SOURCE} != /* ]] && SOURCE="$DIR/$SOURCE" # if $SOURCE was a relative symlink, we need to resolve it relative to the path where the symlink file was located
done
SCRIPT_DIR="$(cd -P "$(dirname "$SOURCE")" && pwd)"
# echo "${SCRIPT_DIR}" # For debugging

node "${SCRIPT_DIR}"/etcHosts.js | while read -r line; do
  IP=$(echo "$line" | cut -f1 -d " ")
  HOST_NAME=$(echo "$line" | cut -f2 -d " ")
  if ! (grep "$HOST_NAME" /etc/hosts >/dev/null); then
    echo Adding "$HOST_NAME" to /etc/hosts
    echo "$line" | sudo tee -a /etc/hosts > /dev/null
  fi
done
