const fs = require('fs');

const configDataFile = `${process.env.HOME}/.robotWebService/config.json`;
const configData = JSON.parse(fs.readFileSync(configDataFile, 'utf8'));

module.exports = configData;
