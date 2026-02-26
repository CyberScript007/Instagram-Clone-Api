const fs = require("fs").promises;

const deleteLocalFile = (filePath) => {
  // let build a promise to not block the event loop
  return new Promise(async (resolve, reject) => {
    try {
      await fs.unlink(filePath);
      resolve();
    } catch (err) {
      reject(
        new Error(`An error occurred when deleting this file: ${err.message}`),
      );
      throw err;
    }
  });
};

module.exports = deleteLocalFile;
