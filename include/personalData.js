// Load personal settings not included in git repo

const fs = require('fs');

const personalDataFile = `${
  process.env.HOME
}/.arlobot/personalDataForBehavior.json`;
// For now just "FAKE" the default file.
// TODO: Maybe later include it properly
const defaultDataFile = `${
  process.env.HOME
}/.arlobot/personalDataForBehavior.json`;
const personalData = JSON.parse(fs.readFileSync(personalDataFile, 'utf8'));
const defaultData = JSON.parse(fs.readFileSync(defaultDataFile, 'utf8'));

// http://stackoverflow.com/a/130504
function DumpObjectIndented(obj, indent) {
  let result = '';
  if (indent === null) {
    // eslint-disable-next-line no-param-reassign
    indent = '';
  }

  for (const property in obj) {
    if (obj.hasOwnProperty(property)) {
      let value = obj[property];
      if (typeof value == 'string') value = '"' + value + '"';
      else if (typeof value == 'object') {
        if (value instanceof Array) {
          // Just let JS convert the Array to a string!
          value = `[ ${value} ]`;
        } else {
          // Recursive dump
          // (replace "  " by "\t" or something else if you prefer)
          const od = DumpObjectIndented(value, `${indent}    `);
          // If you like { on the same line as the key
          value = `{\n${od}\n${indent}}`;
          // If you prefer { and } to be aligned
          // value = "\n" + indent + "{\n" + od + "\n" + indent + "}";
        }
      }
      result += `${indent}"${property}" : ${value},\n`;
    }
  }
  return result.replace(/,\n$/, '');
}

let updateNeeded = false;
for (const prop in defaultData) {
  if (personalData[prop] === undefined) {
    updateNeeded = true;
    personalData[prop] = defaultData[prop];
  }
}
if (updateNeeded) {
  const newFileOutputData = `{\n${DumpObjectIndented(personalData, '    ')}\n}`;
  // console.log(newFileOutputData);
  fs.writeFile(personalDataFile, newFileOutputData);
  console.log(`${personalDataFile} has been updated with new settings`);
  console.log('Please check to see if you need to adjust them for your robot!');
}

module.exports = personalData;
