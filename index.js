const { promisify } = require('util');
const twilio = require('twilio');
const express = require('express');
const cookieParser = require('cookie-parser');
// For parsing Post data
const bodyParser = require('body-parser');
const session = require('express-session');
const redis = require('redis');
const RedisStore = require('connect-redis')(session); // Express.js says NOT to use their session store for production.
const morgan = require('morgan');
const socketIo = require('socket.io');

const port = process.env.PORT || 3003;
// Fancy Express Web Server
// All of my "static" web pages are in the public folder
const app = express();
const webServer = app.listen(port);
const socket = socketIo(webServer);
const configData = require('./include/configData');

const redisClient = redis.createClient();

const redisServer = 'localhost';
const robotWebService = redis.createClient(6379, redisServer, {});
// If you want to subscribe on Redis,
// and also get things,
// you must have two clients, because a subscribed client
// cannot issue any commands once it is subscribed.
const getRedisMessages = redis.createClient(6379, redisServer, {});

const hgetAsync = promisify(getRedisMessages.hget).bind(getRedisMessages);

// What if the redis server doesn't exist?
// const failedRedis = redis.createClient(6379, 'pi', {});
// Be sure to have an on.('error' handler!
// Note that it will "back off and retry" doubling the time
// with each retry.
// By default there is no upper limit to the retry delay.
// You can change that if you like.
// I don't know if this will explode and launch a missile when the retry
// time reaches infinity? I assume not. :P
// failedRedis.on('error', function(err) {
//    console.log('failedRedis connection failed: ' + err);
// });
// And just to be safe for our "production" channel too.
robotWebService.on('error', (err) => {
  console.log(`robotWebService Redis connection failed: ${err}`);
});
// Really, you have to do it for EVERY connection you set up!
getRedisMessages.on('error', (err) => {
  console.log(`robotWebService Redis connection failed: ${err}`);
});
// This could be important if your app only uses Redis "if" it is available,
// and doesn't require it as a part of its basic function.

app.disable('x-powered-by'); // Do not volunteer system info!

const client = redis.createClient({
  host: 'localhost',
  prefix: 'robot-site-sessions',
});
client.unref();
client.on('error', console.error);

app.use(morgan('dev')); // log every request to the console
app.use(
  session({
    store: new RedisStore({ client }),
    secret: configData.cloudServer.sessionSecret,
    saveUninitialized: false, // True for built in, false for redis-connect
    resave: false,
  }),
);
app.use(cookieParser());

app.use(express.static(`${__dirname}/public`));

app.use(bodyParser.json()); // to support JSON-encoded bodies
app.use(
  bodyParser.urlencoded({
    // to support URL-encoded bodies
    extended: true,
  }),
);

const robotSubscribers = [];
const Robot = require('./Robot');

// with Socket.io!

function sendOldMessages() {
  if (robotSubscribers.length > 0) {
    redisClient.lpop('twilio', (listName, item) => {
      if (item !== null) {
        console.log(item);
        socket.sockets.emit('oldMessage', item);
        sendOldMessages();
      }
    });
  }
}

function onNewRobot(data) {
  const newRobot = new Robot(this.id, data);
  robotSubscribers.push(newRobot);
  socket.sockets.emit('welcome');
  console.log(this.id, data);
  console.log(robotSubscribers);
  sendOldMessages();
}

function robotById(id) {
  for (let i = 0; i < robotSubscribers.length; i++) {
    if (robotSubscribers[i].id === id) {
      return robotSubscribers[i];
    }
  }
  return false;
}

function onClientDisconnect() {
  console.log(`Robot has disconnected: ${this.id}`);

  const robotToRemove = robotById(this.id);

  if (!robotToRemove) {
    console.log('Robot not found.');
    return;
  }

  robotSubscribers.splice(robotSubscribers.indexOf(robotToRemove), 1);

  console.log(robotSubscribers);
}

function onSocketConnection(localClient) {
  console.log('Socket connection started:');
  // console.log(localClient);

  localClient.on('new robot', onNewRobot);
  localClient.on('disconnect', onClientDisconnect);
}

socket.sockets.on('connection', onSocketConnection);

app.use(express.static(`${__dirname}/public`));

// Redirect to local robot URL
app.get('/redirect', (req, result) => {
  const clientResponse = result;
  // Default, hoping you named your computer 'arlobot',
  // and that the name can be resolved on your network.
  let robotURL = 'http://arlobot:8080/index2.html';
  getRedisMessages.get('robotURL', (err, res) => {
    if (err) {
      console.log(`Error getting robotURL: ${err}`);
    } else if (res === null) {
      console.log('robotURL not set.');
    } else {
      robotURL = res;
      console.log(`robotURL: ${res}`);
    }
    clientResponse.redirect(robotURL);
    // clientResponse.send('<html><link rel="icon" href="/favicon.ico" type="image/x-icon" /><link rel="shortcut icon" href="/favicon.ico" type="image/x-icon" /><body><h1>Twoflower</h1></body></html>');
  });
});

app.get('/redirect/:host', (req, result) => {
  let destination;
  getRedisMessages.keys(`hostname:*`, async (err, reply) => {
    if (err || reply.length < 1) {
      result.sendStatus(500);
      console.log(`Error getting list of hosts: ${err}`);
    } else {
      const hostList = await Promise.all(
        reply.map(async (hostname) => {
          let ip;
          let webPort;
          try {
            ip = await hgetAsync(hostname, 'ip');
            webPort = await hgetAsync(hostname, 'port');
          } catch (e) {
            console.error(`Error getting host ${hostname} data:`);
            console.error(e);
          }
          return { name: hostname.split(':')[1], ip, port: webPort };
        }),
      );
      hostList.forEach((entry) => {
        if (entry && entry.name && entry.name === req.params.host) {
          destination = `http://${entry.ip}`;
          if (entry.port) {
            destination = `${destination}:${entry.port}`;
          }
          destination = `${destination}/`;
        }
      });

      if (!destination) {
        result.sendStatus(404);
      } else {
        result.redirect(destination);
      }
    }
  });
});

const checkBasicPasswordInPostBody = (input) => {
  let password = 'superSecret1234';
  if (
    configData.cloudServer.password &&
    configData.cloudServer.password.length > 0
  ) {
    password = configData.cloudServer.password;
  }
  return input && input === password;
};

// This allows the robot to tell the server in the cloud what his local URL is,
// Then you can use a public URL, even one written on the robot, for anyone
// to find the robot, even on a strange network where you do not know what IP it has.
// TO test with curl: (Set the URL as desired and the server name as desired.
// curl -v -H "Accept: application/json" -H "Content-type: application/json" --data '{"localURL": "http://192.168.7.115:8080/index2.html", "password": "sueprSecret1785"}' http://localhost:3003/updateRobotURL
app.post('/updateRobotURL', (req, res) => {
  const urlOK = req.body.localURL && req.body.localURL.length > 0;
  const passwordOK = checkBasicPasswordInPostBody(req.body.password);
  if (urlOK && passwordOK) {
    getRedisMessages.set('robotURL', req.body.localURL, (err, reply) => {
      if (err) {
        res.sendStatus(500);
        console.log(`Error setting robotURL: ${err}`);
      } else {
        res.sendStatus(200);
        console.log(reply);
        // Set other items if they exist:
        if (req.body.robotIP) {
          getRedisMessages.set('robotIP', req.body.robotIP);
        }
        if (req.body.robotHostname) {
          getRedisMessages.set('robotHostname', req.body.robotHostname);
        }
      }
    });
    console.log(req.body.localURL);
  } else if (!passwordOK) {
    res.sendStatus(403);
    console.log('Bad password');
  } else {
    res.sendStatus(400);
    console.log('URL not set.');
  }
});

// The purpose of this is to grab all of the data from REDIS about the Robot.
// For custom functions that want it.
// curl -v -H "Accept: application/json" -H "Content-type: application/json" --data '{"password": "sueprSecret1785"}' http://localhost:3003/getRobotInfo
app.post('/getRobotInfo', (req, res) => {
  const passwordOK = checkBasicPasswordInPostBody(req.body.password);
  if (passwordOK) {
    const returnData = {};
    const dataList = ['robotURL', 'robotIP', 'robotHostname'];
    let remainingToGet = dataList.length;
    for (let i = 0; i < dataList.length; i++) {
      // eslint-disable-next-line no-loop-func
      getRedisMessages.get(dataList[i], (err, reply) => {
        if (!err) {
          returnData[dataList[i]] = reply;
        }
        remainingToGet--;
        // eslint-disable-next-line eqeqeq
        if (remainingToGet === 0) {
          console.log(returnData);
          res.send(returnData);
        }
      });
    }
  } else {
    res.sendStatus(403);
    console.log('Bad password');
  }
});

app.post('/twilio', (request, response) => {
  if (
    twilio.validateExpressRequest(request, configData.twilio.auth_token, {
      url: configData.twilio.smsWebhook,
    })
  ) {
    let messageForRedis = {
      smsText: request.body.Body,
      smsTo: request.body.To,
      smsFrom: request.body.From,
    };
    console.log(messageForRedis.smsFrom, messageForRedis.smsText);
    messageForRedis = JSON.stringify(messageForRedis);
    // Tell Twilio we got the message, and reply to the sender
    response.header('Content-Type', 'text/xml');
    if (robotSubscribers.length > 0) {
      socket.sockets.emit('newMessage', messageForRedis);
      response.send('<Response><Sms>Got it!</Sms></Response>');
    } else {
      // Save the message in REDIS
      redisClient.rpush('twilio', messageForRedis);
      response.send(
        '<Response><Sms>Sorry, nobody is home, try again later.</Sms></Response>',
      );
    }
  } else {
    console.log('Invalid. Does not appear to be from Twilio!');
    response.sendStatus(403);
  }
});

// eslint-disable-next-line consistent-return
app.use((req, res, next) => {
  // https://stackoverflow.com/a/33905671/4982408

  // parse login and password from headers
  const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
  const strauth = Buffer.from(b64auth, 'base64').toString();
  const splitIndex = strauth.indexOf(':');
  // const login = strauth.substring(0, splitIndex);
  const password = strauth.substring(splitIndex + 1);

  let serverPassword = 'superSecret1234';
  if (
    configData.cloudServer.password &&
    configData.cloudServer.password.length > 0
  ) {
    serverPassword = configData.cloudServer.password;
  }

  // Verify login and password are set and correct
  // FYI: I am ignoring the username, this is absurdly basic.
  if (password && password === serverPassword) {
    // Access granted...
    return next();
  }

  // Access denied...
  res.set('WWW-Authenticate', 'Basic realm="401"'); // change this
  res.status(401).send('Authentication required.'); // custom message
});

// Routes below here require Basic Auth

// The purpose of this is to add a host name and IP to a list of host names that
// can be retrieved and/or redirected to.
// curl -v -H "Accept: application/json" -H "Content-type: application/json" --data '{"password": "sueprSecret1785"}' http://localhost:3003/addHostname
app.post('/addHostname', (req, res) => {
  const hostname = req.body.hostname;
  const ip = req.body.ip;
  const webPort = req.body.port;
  if (hostname && ip) {
    getRedisMessages.hmset(
      `hostname:${hostname}`,
      ['ip', ip, 'port', webPort || ''],
      (err, reply) => {
        if (err) {
          res.sendStatus(500);
          console.log(`Error setting hostname ${hostname}/${ip}: ${err}`);
        } else {
          res.sendStatus(200);
          console.log(reply);
          console.log(
            `Registered hostname/ip${
              webPort ? '/port' : ''
            } entry: ${hostname}/${ip}${webPort ? `/${webPort}` : ''}`,
          );
        }
      },
    );
  } else {
    res.sendStatus(400);
    console.log('Missing parameters in body JSON.');
  }
});

app.get('/hosts', (req, res) => {
  getRedisMessages.keys(`hostname:*`, async (err, reply) => {
    if (err || reply.length < 1) {
      res.sendStatus(500);
      console.log(`Error getting list of hosts: ${err}`);
    } else {
      const hostList = await Promise.all(
        reply.map(async (hostname) => {
          let ip;
          let webPort;
          try {
            ip = await hgetAsync(hostname, 'ip');
            webPort = await hgetAsync(hostname, 'port');
          } catch (e) {
            console.error(`Error getting host ${hostname} data:`);
            console.error(e);
          }
          return { name: hostname.split(':')[1], ip, port: webPort };
        }),
      );
      res.json(hostList);
    }
  });
});

// TODO: Add a web page with links to all of the hosts, for using from a mobile phone or anything where
//       having one page to go to instead of lots of them would help.
