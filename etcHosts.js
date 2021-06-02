const fetch = require('node-fetch');
const base64 = require('base-64');
const configData = require('./include/configData');

const etcHosts = async () => {
  const url = `${configData.cloudServer.address}hosts`;
  try {
    const result = await fetch(url, {
      method: 'get',
      headers: {
        Authorization: `Basic ${base64.encode(
          `ignored:${configData.cloudServer.password}`,
        )}`,
      },
    });

    if (result.ok) {
      const json = await result.json();
      if (json && json.length > 0) {
        json.forEach((entry) => {
          console.log(`${entry.ip} ${entry.name}`);
        });
      }
    } else {
      console.error('Error connecting to Cloud Server:');
      console.error(result);
    }
  } catch (e) {
    console.error('Error connecting to Cloud Server:');
    console.error(e);
  }
};

module.exports = etcHosts;

if (require.main === module) {
  (async () => {
    try {
      await etcHosts();
    } catch (e) {
      console.error(e);
    }
  })();
}
