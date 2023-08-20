#!/usr/bin/env bash
# Test redirect before setting it.
echo "redirect:"
curl -H "Accept: application/json" http://localhost:3003/redirect
printf "\n\n"


echo "getRobotInfo:"
curl -H "Accept: application/json" -H "Content-type: application/json" --data '{"password": "superSecret1234"}' http://localhost:3003/getRobotInfo
printf "\n\n"

echo "updateRobotURL:"
curl -H "Accept: application/json" -H "Content-type: application/json" --data '{"localURL": "http://127.0.0.1/index.html", "password": "superSecret1234", "robotIP": "127.0.0.1", "robotHostname": "TwoFlower"}' http://localhost:3003/updateRobotURL
printf "\n\n"

echo "getRobotInfo:"
curl -H "Accept: application/json" -H "Content-type: application/json" --data '{"password": "superSecret1234"}' http://localhost:3003/getRobotInfo
printf "\n\n"

echo "addHostname:"
curl -H 'Authorization: Basic c3VwZXJTZWNyZXQxMjM0' -H "Accept: application/json" -H "Content-type: application/json" --data '{"hostname": "me", "ip": "127.0.0.1", "port": 8080}' http://localhost:3003/addHostname
printf "\n\n"

echo "redirect:"
curl -H "Accept: application/json" http://localhost:3003/redirect
printf "\n\n"

echo "redirectMe:"
curl -H "Accept: application/json" http://localhost:3003/redirect/me
printf "\n\n"

echo "hosts:"
curl -H 'Authorization: Basic c3VwZXJTZWNyZXQxMjM0' -H "Accept: application/json" http://localhost:3003/hosts
printf "\n\n"
