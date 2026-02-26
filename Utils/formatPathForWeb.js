const formatPathForWeb = function (path) {
  return path ? path.replace(/\\/g, "/") : null;
};

module.exports = formatPathForWeb;
