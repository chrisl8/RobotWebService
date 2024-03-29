Robot Cloud Server
====================

The purpose of this code is to run in the "cloud" on a server, such as on a Digital Ocean droplet in order to facilitate the communication between the robot on a network that is either private, or simply unstable.

Features:
1. Accept incoming messages and relay them to robot when it comes online.  
2. Provide a consistent web interface URL that will redirect to the robot's current IP address. 
3. Provide ability to get IP and Host names for adding to /etc/hosts 

This is more of a personal one off thing than code that anyone might use.
It is a reasonably good example of a cloud Socket.io server with the ability to store and forward messages though.
If you are using ArloBot, and need a way to communicate with it or find it on a network, message me, and I will see if I can help you get this running.  

# Setup and Run

## Prerequisites.

### Node.js
I suggest using the latest LTS, and I suggest using [nvm](https://github.com/nvm-sh/nvm) to install it.
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.2/install.sh | bash
nvm install node --latest-npm
nvm use node
nvm alias default node
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
  }
}
```

#### Test run
```bash
npm ci
node index.js
```

#### PM2
The expected way to run this is to use PM2 to run it continuously. 

`./startpm2.sh`

#### Cron job
You probably want this to just run on your cloud server 24x7, so it should start in cron.

Add something like this to your crontab:  
`@reboot /home/chrisl8/RobotWebService/startpm2.sh`  

Be sure to replace my home folder with your home directory.