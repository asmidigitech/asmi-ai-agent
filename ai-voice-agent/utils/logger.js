const log = (message, data = null) => {
  console.log(`[LOG]: ${message}`);
  if (data) console.log(data);
};

module.exports = { log };
