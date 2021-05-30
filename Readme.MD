Robot Cloud Server
====================

The purpose of this code is to run in the "cloud" on a server, such as on a Digital Ocean droplet in order to facilitate the communication between the robot on a network that is either private, or simply unstable.

Features:
1. Accept incoming Twilio messages and relay them to robot when it comes online.  
2. Provide a consistent web interface URL that will redirect to the robot's current IP address. 

This is more of a personal one off thing than code that anyone might use.
It is a reasonably good example of a cloud Socket.io server with the ability to store and forward messages though.
If you are using ArloBot, and need a way to communicate with it or find it on a network, message me, and I will see if I can help you get this running.  

# Setup and Run

## Prerequisites.

### Node.js
I suggest using the latest LTS, and I suggest using [nvm](https://github.com/nvm-sh/nvm) to install it.
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.38.0/install.sh | bash
nvm install --lts
```

### Redis
I assume that you are on Ubuntu, or something that uses apt, if not, you probably know more than I do about installing packages on your distro of choice.
```bash
sudo apt install redis-server
sudo vim /etc/redis/redis.conf 
# CHANGE
supervised no
# TO:
supervised systemd
:wq
sudo systemctl restart redis.service
```
Test to see that Redis is running
```bash
redis-cli
127.0.0.1:6379> ping
PONG
127.0.0.1:6379> quit
```

### Setup and run RobotWebService

#### Configuration File
```bash
cd
mkdir .robotWebService
```
Create a file called ~/.robotWebService/config.json with the following contents:
```json
{
  "cloudServer": {
    "password": "superSecret1234",
    "sessionSecret": "RandomStringForSessionID"
  },
  "twilio": {
    "auth_token": "Twilio Auth Token",
    "smsWebhook": "https://robot.mydomain.net/twilio"
  }
}
```

```bash
npm ci
node index.js
```