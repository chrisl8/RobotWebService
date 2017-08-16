const personalData = require('./include/personalData');
// Redis
const redis = require('redis'),
    client = redis.createClient();
const twilio = require('twilio');
const redisServer = 'localhost';
const arloBot = redis.createClient(6379, redisServer, {});
// If you want to subscribe on Redis,
// and also get things,
// you must have two clients, because a subscribed client
// cannot issue any commands once it is subscribed.
const getRedisMessages = redis.createClient(6379, redisServer, {});

const chatbot = require('./chatbot');

const mongoose = require('mongoose');
const passport = require('passport');
const flash = require('connect-flash');

const morgan = require('morgan');

const configDB = {
    url: 'mongodb://localhost:27017/passport'
};
mongoose.connect(configDB.url);

require('./config/passport')(passport); // pass passport for configuration

// What if the redis server doesn't exist?
//const failedRedis = redis.createClient(6379, 'pi', {});
// Be sure to have an on.('error' handler!
// Note that it will "back off and retry" doubling the time
// with each retry.
// By default there is no upper limit to the retry delay.
// You can change that if you like.
// I don't know if this will explode and launch a missile when the retry
// time reaches infinity? I assume not. :P
//failedRedis.on('error', function(err) {
//    console.log('failedRedis connection failed: ' + err);
//});
// And just to be safe for our "production" channel too.
arloBot.on('error', function (err) {
    console.log('arloBot Redis connection failed: ' + err);
});
// Really, you have to do it for EVERY connection you set up!
getRedisMessages.on('error', function (err) {
    console.log('arloBot Redis connection failed: ' + err);
});
// This could be important if your app only uses Redis "if" it is available,
// and doesn't require it as a part of its basic function.

const express = require('express');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const RedisStore = require('connect-redis')(session); // Express.js says NOT to use their session store for production.

// Fancy Express Web Server
// All of my "static" web pages are in the public folder
const app = express();
app.disable('x-powered-by'); // Do not volunteer system info!

app.use(morgan('dev')); // log every request to the console
app.use(session({
    store: new RedisStore({
        host: 'localhost',
        prefix: 'robot-site-sessions'
    }),
    secret: personalData.cloudServer.sessionSecret,
    saveUninitialized: false, // True for built in, false for redis-connect
    resave: false
}));
app.use(cookieParser());

app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');

app.use(express.static(__dirname + '/public'));

// For parsing Post data
const bodyParser = require('body-parser');
app.use(bodyParser.json()); // to support JSON-encoded bodies
app.use(bodyParser.urlencoded({ // to support URL-encoded bodies
    extended: true
}));

app.use(passport.initialize());
app.use(passport.session()); // persistent login sessions
app.use(flash()); // use connect-flash for flash messages stored in session

// routes ======================================================================
require('./app/routes.js')(app, passport); // load our routes and pass in our app and fully configured passport
//

const robotSubscribers = [];
const Robot = require('./Robot');
const port = process.env.PORT || 3003;
const webServer = app.listen(port);
// with Socket.io!
const socket = require('socket.io').listen(webServer);

function sendOldMessages() {
    if (robotSubscribers.length > 0) {
        client.lpop('twilio', function (listName, item) {
            if (item !== null) {
                console.log(item);
                socket.sockets.emit('oldMessage', item);
                sendOldMessages();
            }
        });
    }
}

socket.sockets.on('connection', onSocketConnection);

function onSocketConnection(client) {
    console.log('Socket connection started:');
    //console.log(client);

    client.on('new robot', onNewRobot);
    client.on('disconnect', onClientDisconnect);
}

function onNewRobot(data) {
    const newRobot = new Robot(this.id, data);
    robotSubscribers.push(newRobot);
    socket.sockets.emit('welcome');
    console.log(this.id, data);
    console.log(robotSubscribers);
    sendOldMessages();
}

function onClientDisconnect() {
    console.log('Robot has disconnected: ' + this.id);

    const robotToRemove = robotById(this.id);

    if (!robotToRemove) {
        console.log('Robot not found.');
        return;
    }

    robotSubscribers.splice(robotSubscribers.indexOf(robotToRemove), 1);

    console.log(robotSubscribers);
}

function robotById(id) {
    for (let i = 0; i < robotSubscribers.length; i++) {
        if (robotSubscribers[i].id === id) {
            return robotSubscribers[i];
        }
    }
    return false;
}

app.use(express.static(__dirname + '/public'));

// Redirect to local robot URL
app.get('/redirect', function (req, res) {
    const clientResponse = res;
    // Default, hoping you named your computer 'arlobot',
    // and that the name can be resolved on your network.
    let robotURL = 'http://arlobot:8080/index2.html';
    getRedisMessages.get('robotURL', function (err, res) {
        if (err) {
            console.log('Error getting robotURL: ' + err);
        } else if (res === null) {
            console.log('robotURL not set.');
        } else {
            robotURL = res;
            console.log('robotURL: ' + res);
        }
        clientResponse.redirect(robotURL);
        //clientResponse.send('<html><link rel="icon" href="/favicon.ico" type="image/x-icon" /><link rel="shortcut icon" href="/favicon.ico" type="image/x-icon" /><body><h1>Twoflower</h1></body></html>');
    });
});

// const talkParams = {
//     client_name: YOUR_CLIENT_NAME,
//     sessionid: YOUR_SESSION_ID,
//     input: YOUR_INPUT,
//     extra: BOOLEAN,
//     trace: BOOLEAN,
//     recent: BOOLEAN
// };

// Chatbot
const fs = require('fs');
const reBracketText = /\[(.*?)\]/g;
app.post('/chat', function (req, res) {
    console.log(req.body);
    res.setHeader('Content-Type', 'application/json');
    // bot.talk(talkParams, function (err, res) {
    let inputText = req.body.say;
    let reQuestionMarks = /^\?+$/;
    if (inputText.match(reQuestionMarks)) {
        console.log('All ?\'s');
        inputText = '*';
    }
    chatbot.talk({ input: inputText, sessionid: req.body.sessionid }, function (error, chatbotResponse) {
        if (error || chatbotResponse.status === 'error') {
            console.log(error, chatbotResponse.status);
            res.send(JSON.stringify({ botsay: "Sorry, I'm confused and lost." }));
        } else {
            console.log(chatbotResponse.responses);
            let thisResponse = 'Sorry, come again?';
            if (chatbotResponse.responses.length > 0) {
                thisResponse = chatbotResponse.responses[0];
                let constiableArray = thisResponse.match(reBracketText);
                if (constiableArray && constiableArray.length > 0) {
                    console.log(`Variables: `);
                    for (let i = 0; i < constiableArray.length; i++) {
                        console.log(constiableArray[i].replace(/[\[,\]]/g, ''));
                    }
                }
            }
            console.log(thisResponse);
            res.send(JSON.stringify({ botsay: thisResponse, sessionid: chatbotResponse.sessionid }));
        }
        if (chatbotResponse.sessionid) {
            fs.appendFile(`chatlogs/${chatbotResponse.sessionid}.log`, `Input: ${req.body.say}\nTwoFlower: ${chatbotResponse.responses[0]}\n`);
        }
    });
});

// This allows the robot to tell the server in the cloud what his local URL is,
// Then you can use a public URL, even one written on the robot, for anyone
// to find the robot, even on a strange network where you do not know what IP it has.
// TO test with curl: (Set the URL as desired and the server name as desired.
// curl -v -H "Accept: application/json" -H "Content-type: application/json" --data '{"localURL": "http://192.168.7.115:8080/index2.html", "password": "sueprSecret1785"}' http://localhost:3003/updateRobotURL
app.post('/updateRobotURL', function (req, res) {
    let password = 'sueprSecret1785';
    if (personalData.cloudServer.password && personalData.cloudServer.password.length > 0) {
        password = personalData.cloudServer.password;
    }
    const urlOK = req.body.localURL && req.body.localURL.length > 0;
    // TODO: Use real authentication and SSL if we are ever afraid of this being hijacked.
    const passwordOK = req.body.password && req.body.password === password;
    if (urlOK && passwordOK) {
        getRedisMessages.set('robotURL', req.body.localURL, function (err, reply) {
            if (err) {
                res.sendStatus(500);
                console.log('Error setting robotURL: ' + err);
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
    } else {
        if (!passwordOK) {
            res.sendStatus(403);
            console.log('Bad password');
        } else {
            res.sendStatus(400);
            console.log('URL not set.');
        }
    }
});

// The purpose of this is to grab all of the data from REDIS about the Robot.
// For custom functions that want it.
// curl -v -H "Accept: application/json" -H "Content-type: application/json" --data '{"password": "sueprSecret1785"}' http://localhost:3003/getRobotInfo
app.post('/getRobotInfo', function (req, res) {
    let password = 'sueprSecret1785';
    if (personalData.cloudServer.password && personalData.cloudServer.password.length > 0) {
        password = personalData.cloudServer.password;
    }
    const passwordOK = req.body.password && req.body.password === password;
    if (passwordOK) {
        const returnData = {};
        const dataList = ['robotURL', 'robotIP', 'robotHostname'];
        let remainingToGet = dataList.length;
        for (let i = 0; i < dataList.length; i++) {
            (function (i) {
                getRedisMessages.get(dataList[i], function (err, reply) {
                    if (!err) {
                        returnData[dataList[i]] = reply;
                    }
                    remainingToGet--;
                    if (remainingToGet == 0) {
                        console.log(returnData);
                        res.send(returnData);
                    }
                });
            })(i);
        }
    } else {
        res.sendStatus(403);
        console.log('Bad password');
    }
});

app.post('/twilio', function (request, response) {
    if (twilio.validateExpressRequest(request, personalData.twilio.auth_token, { url: personalData.twilio.smsWebhook })) {
        let messageForRedis = {
            smsText: request.body.Body,
            smsTo: request.body.To,
            smsFrom: request.body.From
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
            client.rpush("twilio", messageForRedis);
            response.send('<Response><Sms>Sorry, nobody is home, try again later.</Sms></Response>');
        }
    } else {
        console.log('Invalid. Does not appear to be from Twilio!');
        response.sendStatus(403);
    }
});
