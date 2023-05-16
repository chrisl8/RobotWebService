import twilio from 'twilio';
import express from 'express';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import { Server } from 'socket.io';
import sqlite3 from 'sqlite3';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import configData from './include/configData.js';
import Robot from './Robot.js';

const port = process.env.PORT || 3003;
// Fancy Express Web Server
// All of my "static" web pages are in the public folder
const app = express();
const webServer = app.listen(port);
const socket = new Server(webServer);

// https://stackoverflow.com/a/64383997/4982408
// eslint-disable-next-line no-underscore-dangle
const __filename = fileURLToPath(import.meta.url);
// eslint-disable-next-line no-underscore-dangle
const __dirname = dirname(__filename);

const dbName = `${__dirname}/database.sqlite`;
const db = new sqlite3.Database(dbName, (err) => {
  if (err) {
    console.error(err.message);
  }
  console.log('Connected to the database.');
});

// eslint-disable-next-line func-names
db.query = function (sql, params) {
  const that = this;
  return new Promise((resolve, reject) => {
    that.all(sql, params, (error, rows) => {
      if (error) reject(error);
      else resolve({ rows });
    });
  });
};

// Database initialization.
try {
  // Creating the users table if it does not exist.
  let sqlCreateTable = `CREATE TABLE IF NOT EXISTS keyValueStore (
      key TEXT PRIMARY KEY,
      value TEXT
    );`;
  await db.query(sqlCreateTable, []);

  // Creating the twilio table if it does not exist.
  sqlCreateTable = `CREATE TABLE IF NOT EXISTS twilio (
      smsText TEXT,
      smsTo TEXT,
      smsFrom TEXT
    );`;
  await db.query(sqlCreateTable, []);

  // Creating the hosts table if it does not exist.
  sqlCreateTable = `CREATE TABLE IF NOT EXISTS hosts ( 
      name TEXT PRIMARY KEY,
      ip TEXT,
      port TEXT
    );`;
  await db.query(sqlCreateTable, []);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

const setKeyValueDb = async (key, value) => {
  let result = false;
  try {
    const sql =
      'INSERT OR REPLACE INTO keyValueStore (key, value) VALUES ($1, $2);';
    await db.query(sql, [key, value]);
    result = true;
  } catch (e) {
    console.error(`Error adding ${key}:${value} to database:`);
    console.error(e.message);
  }
  return result;
};

const getKeyValueDb = async (key) => {
  let result = null;
  try {
    const sql = 'SELECT value FROM keyValueStore WHERE key = ?';
    const value = await db.query(sql, [key]);
    if (value && value.rows && value.rows.length > 0 && value.rows[0].value) {
      result = value.rows[0].value;
    }
    console.log(result);
  } catch (e) {
    console.error(`Error getting ${key} from database:`);
    console.error(e.message);
  }
  return result;
};

const addHostDb = async (name, ip, hostPort) => {
  let result = false;
  try {
    const sql =
      'INSERT OR REPLACE INTO hosts (name, ip, port) VALUES ($1, $2, $3);';
    await db.query(sql, [name, ip, hostPort]);
    result = true;
  } catch (e) {
    console.error(`Error adding host ${name} to database:`);
    console.error(e.message);
  }
  return result;
};

const getHostDb = async (name) => {
  let result = null;
  try {
    const sql = 'SELECT * FROM hosts WHERE name = ?';
    const value = await db.query(sql, [name]);
    if (value && value.rows && value.rows.length > 0 && value.rows[0].name) {
      result = value.rows[0];
    }
  } catch (e) {
    console.error(`Error getting host ${name} from database:`);
    console.error(e.message);
  }
  return result;
};

const getAllHostsDb = async () => {
  let result = null;
  try {
    const sql = 'SELECT * FROM hosts';
    const value = await db.query(sql);
    if (value && value.rows && value.rows.length > 0 && value.rows[0].name) {
      result = value.rows;
    }
  } catch (e) {
    console.error(`Error getting host list from database:`);
    console.error(e.message);
  }
  return result;
};

const addTwilioMessage = async (message) => {
  let result = false;
  try {
    const sql =
      'INSERT INTO twilio (smsText, smsTo, smsFrom) VALUES ($1, $2, $3);';
    await db.query(sql, [message.smsText, message.smsTo, message.smsFrom]);
    result = true;
  } catch (e) {
    console.error(`Error adding Twilio message to database:`);
    console.error(e.message);
  }
  return result;
};

const getTwilioMessages = async () => {
  let result = null;
  try {
    const sql = 'SELECT rowid, * FROM twilio;';
    const value = await db.query(sql);
    console.log(value);
    result = value;
  } catch (e) {
    console.error(`Error getting Twilio messages from database:`);
    console.error(e.message);
  }
  return result;
};

const delTwilioMessage = async (rowid) => {
  let result = false;
  try {
    const sql = 'DELETE FROM twilio WHERE rowid = $1;';
    await db.query(sql, [rowid]);
    result = true;
  } catch (e) {
    console.error(`Error deleting Twilio message from database:`);
    console.error(e.message);
  }
  return result;
};

app.disable('x-powered-by'); // Do not volunteer system info!

app.use(morgan('dev')); // log every request to the console
app.use(cookieParser());

app.use(express.static(`${__dirname}/public`));

app.use(express.json()); // to support JSON-encoded bodies
app.use(
  express.urlencoded({
    // to support URL-encoded bodies
    extended: true,
  }),
);

const robotSubscribers = [];

// with Socket.io!

async function sendOldMessages() {
  if (robotSubscribers.length > 0) {
    const messages = await getTwilioMessages();
    if (messages && messages.rows && messages.rows.length > 0) {
      await Promise.all(
        messages.rows.map(async (entry) => {
          console.log(entry);
          socket.sockets.emit('oldMessage', {
            smsText: entry.smsText,
            smsTo: entry.smsTo,
            smsFrom: entry.smsFrom,
          });
          await delTwilioMessage(entry.rowid);
        }),
      );
    }
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
app.get('/redirect', async (req, result) => {
  const clientResponse = result;
  // Default, hoping you named your computer 'arlobot',
  // and that the name can be resolved on your network.
  let robotURL = await getKeyValueDb('robotURL');
  if (!robotURL) {
    console.log('robotURL not set.');
    robotURL = 'http://arlobot:8080/index2.html';
  } else {
    console.log(`robotURL: ${robotURL}`);
  }
  clientResponse.redirect(robotURL);
  // clientResponse.send('<html><link rel="icon" href="/favicon.ico" type="image/x-icon" /><link rel="shortcut icon" href="/favicon.ico" type="image/x-icon" /><body><h1>Twoflower</h1></body></html>');
});

app.get('/redirect/:host', async (req, result) => {
  const name = req.params.host;
  let destination;
  const hostData = await getHostDb(name);
  if (hostData) {
    if (hostData && hostData.name && hostData.name === name) {
      destination = `http://${hostData.ip}`;
      if (hostData.port) {
        destination = `${destination}:${hostData.port}`;
      }
      destination = `${destination}/`;
    }
  }
  if (!destination) {
    result.sendStatus(404);
  } else {
    console.log(`Redirecting to ${destination}`);
    result.redirect(destination);
  }
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
// curl -v -H "Accept: application/json" -H "Content-type: application/json" --data '{"localURL": "http://192.168.7.115:8080/index2.html", "password": "superSecret1234"}' http://localhost:3003/updateRobotURL
app.post('/updateRobotURL', async (req, res) => {
  const urlOK = req.body.localURL && req.body.localURL.length > 0;
  const passwordOK = checkBasicPasswordInPostBody(req.body.password);
  if (urlOK && passwordOK) {
    const result = await setKeyValueDb('robotURL', req.body.localURL);
    if (!result) {
      res.sendStatus(500);
      console.log(`Error setting robotURL.`);
    } else {
      // Set other items if they exist:
      if (req.body.robotIP) {
        await setKeyValueDb('robotIP', req.body.robotIP);
      }
      if (req.body.robotHostname) {
        await setKeyValueDb('robotHostname', req.body.robotHostname);
      }
      res.sendStatus(200);
    }
    console.log(req.body.localURL);
  } else if (!passwordOK) {
    res.sendStatus(403);
    console.log('Bad password');
  } else {
    res.sendStatus(400);
    console.log('URL not set.');
  }
});

// The purpose of this is to grab all the data about the Robot.
// For custom functions that want it.
// curl -v -H "Accept: application/json" -H "Content-type: application/json" --data '{"password": "superSecret1234"}' http://localhost:3003/getRobotInfo
app.post('/getRobotInfo', async (req, res) => {
  const passwordOK = checkBasicPasswordInPostBody(req.body.password);
  if (passwordOK) {
    const returnData = {};
    returnData.robotURL = await getKeyValueDb('robotURL');
    returnData.robotIP = await getKeyValueDb('robotIP');
    returnData.robotHostname = await getKeyValueDb('robotHostname');
    console.log('getRobotInfo:', returnData);
    res.send(returnData);
  } else {
    res.sendStatus(403);
    console.log('Bad password');
  }
});

app.post('/talkToOrac', async (req, res) => {
  const passwordOK = checkBasicPasswordInPostBody(req.body.password);
  const data = { ...req.body };
  delete data.password;
  if (passwordOK) {
    console.log(data);
    // TODO: Can we perhaps return something for the shortcut to say/do?
    res.sendStatus(200);
  } else {
    res.sendStatus(403);
    console.log('Bad password');
  }
});

app.post('/twilio', async (request, response) => {
  if (
    twilio.validateExpressRequest(request, configData.twilio.auth_token, {
      url: configData.twilio.smsWebhook,
    })
  ) {
    let message = {
      smsText: request.body.Body,
      smsTo: request.body.To,
      smsFrom: request.body.From,
    };
    console.log(message.smsFrom, message.smsText);
    // Tell Twilio we got the message, and reply to the sender
    response.header('Content-Type', 'text/xml');
    if (robotSubscribers.length > 0) {
      message = JSON.stringify(message);
      socket.sockets.emit('newMessage', message);
      response.send('<Response><Sms>Got it!</Sms></Response>');
    } else {
      // Save the message
      await addTwilioMessage(message);
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
// curl -v -H 'Authorization: Basic c3VwZXJTZWNyZXQxMjM0' -H "Accept: application/json" -H "Content-type: application/json" --data '{"hostname": "me", "ip": "127.0.0.1"}' http://localhost:3003/addHostname
// Where c3VwZXJTZWNyZXQxMjM0 is your base64 encoded password from the config file obtained like so:
// echo -n "superSecret1234" | base64
// Then to get the data back out in a browser:
// http://localhost:3003/hosts
app.post('/addHostname', async (req, res) => {
  const name = req.body.hostname;
  const ip = req.body.ip;
  const hostPort = req.body.port;
  if (name && ip) {
    const result = await addHostDb(name, ip, hostPort);
    if (!result) {
      res.sendStatus(500);
    } else {
      res.sendStatus(200);
      console.log(
        `Registered hostname/ip${hostPort ? '/port' : ''} entry: ${name}/${ip}${
          hostPort ? `/${hostPort}` : ''
        }`,
      );
    }
  } else {
    res.sendStatus(400);
    console.log('Missing parameters in body JSON.');
  }
});

app.get('/hosts', async (req, res) => {
  const hostList = await getAllHostsDb();
  if (!hostList || hostList.lengh === 0) {
    res.sendStatus(404);
  } else {
    console.log(hostList);
    res.json(hostList);
  }
});

app.get('/view-hosts', async (req, res) => {
  const hostList = await getAllHostsDb();
  if (!hostList || hostList.lengh === 0) {
    res.sendStatus(404);
  } else {
    let hostHTML = '';
    hostList.forEach((hostData) => {
      let destination;
      if (hostData && hostData.name) {
        destination = `http://${hostData.ip}`;
        if (hostData.port) {
          destination = `${destination}:${hostData.port}`;
        }
        destination = `${destination}/`;
      }
      if (destination) {
        hostHTML = `${hostHTML}<h2>${hostData.name}</h2>`;
        hostHTML = `${hostHTML}<ul>`;
        hostHTML = `${hostHTML}<li>${hostData.ip}</li>`;
        hostHTML = `${hostHTML}<li><a href="${destination}">${destination}</a></li>`;
        hostHTML = `${hostHTML}<li><a href="https://twoflower.ekpyroticfrood.net/redirect/${hostData.name}">https://twoflower.ekpyroticfrood.net/redirect/${hostData.name}</a></li>`;
        hostHTML = `${hostHTML}</ul>`;
      }
    });
    res.send(`<html><body><h1>Host List</h1>${hostHTML}</body></html>`);
  }
});

async function closeServer() {
  console.log('Shutdown requested. PLEASE BE PATIENT! Working on it...');
  console.log('Closing Database...');
  await db.close();
  process.exit();
}

process.on('SIGINT', async () => {
  await closeServer();
});
