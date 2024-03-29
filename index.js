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
const io = new Server(webServer);

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

  // Creating the generic message table if it does not exist.
  sqlCreateTable = `CREATE TABLE IF NOT EXISTS messages
                    (
                        text TEXT,
                        \`to\`   TEXT,
                        \`from\` TEXT
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

const addMessage = async ({ to, message, from }) => {
  let result = false;
  try {
    const sql =
      'INSERT INTO messages (text, `to`, `from`) VALUES ($1, $2, $3);';
    await db.query(sql, [message, to, from]);
    result = true;
  } catch (e) {
    console.error(`Error adding message to database:`);
    console.error(e.message);
  }
  return result;
};

const getMessagesTo = async (name) => {
  let result = null;
  try {
    const sql = 'SELECT rowid, * FROM messages WHERE `to` = $1';
    const value = await db.query(sql, [name]);
    result = value;
  } catch (e) {
    console.error(`Error getting messages from database:`);
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

const delMessage = async (rowid) => {
  let result = false;
  try {
    const sql = 'DELETE FROM messages WHERE rowid = $1;';
    await db.query(sql, [rowid]);
    result = true;
  } catch (e) {
    console.error(`Error deleting message from database:`);
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

const robotSubscribers = new Map();

// with Socket.io!

function socketEmitToId({ emitToId, socketEvent, data }) {
  // emit.to doesn't work to send back to the sender, so we need this special function
  // using io instead of just the socket.
  // per https://socket.io/docs/v3/emit-cheatsheet/
  // WARNING: `socket.to(socket.id).emit()` will NOT work, as it will send to everyone in the room
  // named `socket.id` but the sender. Please use the classic `socket.emit()` instead.
  io.sockets.to(emitToId).emit(socketEvent, data);
}

async function sendOldMessages(name) {
  if (robotSubscribers.has(name)) {
    const robotSubscriber = robotSubscribers.get(name);
    const messages = await getMessagesTo(name);
    if (messages && messages.rows && messages.rows.length > 0) {
      await Promise.all(
        messages.rows.map(async (entry) => {
          await socketEmitToId({
            emitToId: robotSubscriber.id,
            socketEvent: 'oldMessage',
            data: {
              text: entry.text,
              to: entry.to,
              from: entry.from,
            },
          });
          await delMessage(entry.rowid);
        }),
      );
    }
  }
}

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

async function onNewRobot(data) {
  if (checkBasicPasswordInPostBody(data.password)) {
    const newRobot = new Robot(this.id, data.name);
    robotSubscribers.set(data.name, newRobot);
    io.sockets.emit('welcome');
    console.log(`${data.name} has connected with Socket ID ${this.id}`);
    await sendOldMessages(data.name);
  } else {
    console.log(`${data.name} validation failed`);
    this.disconnect();
  }
}

// eslint-disable-next-line consistent-return
function getMapKeybyValueObjectKey(map, searchKey, searchValue) {
  for (const [key, value] of map.entries()) {
    if (value[searchKey] && value[searchKey] === searchValue) return key;
  }
}

function onClientDisconnect() {
  console.log(`Robot has disconnected from Socket ID: ${this.id}`);

  const entryToRemove = getMapKeybyValueObjectKey(
    robotSubscribers,
    'id',
    this.id,
  );

  if (!entryToRemove) {
    console.log('Robot not found.');
    console.log(robotSubscribers);
    return;
  }

  console.log(`${robotSubscribers.get(entryToRemove).name} has disconnected.`);
  robotSubscribers.delete(entryToRemove);
}

async function onSocketConnection(localClient) {
  const remoteIp =
    localClient.handshake.headers['x-real-ip'] ||
    localClient.conn.remoteAddress;
  console.log(`Socket connection started from ${remoteIp}`);

  localClient.on('new robot', onNewRobot);
  localClient.on('disconnect', onClientDisconnect);
}

io.sockets.on('connection', onSocketConnection);

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

// This allows the robot to tell the server in the cloud what his local URL is,
// Then you can use a public URL, even one written on the robot, for anyone
// to find the robot, even on a strange network where you do not know what IP it has.
// To test with curl: (Set the URL as desired and the server name as desired.
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

app.post('/message/send', async (req, res) => {
  const passwordOK = checkBasicPasswordInPostBody(req.body.password);
  const data = { ...req.body };
  delete data.password; // Do not forward the password from the body to the recipient.
  console.log(data);
  if (passwordOK && data.to && data.from) {
    if (robotSubscribers.has(data.to)) {
      const robotSubscriber = robotSubscribers.get(data.to);
      socketEmitToId({
        emitToId: robotSubscriber.id,
        socketEvent: 'newMessage',
        data,
      });
      res.sendStatus(200);
    } else {
      // Save the message
      await addMessage({ to: data.to, message: data.text, from: data.from });
      res.send(
        `Sorry, ${data.to} is not online, but we will pass along the message when they return.`,
      );
    }
  } else {
    res.sendStatus(403);
    console.log('Bad password');
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
