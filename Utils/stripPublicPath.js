/**
 * Helper to strip the 'public/' prefix, making the path ready for the web URL.
 * @param {string} fullPath - Path including the 'public/' prefix (e.g., 'public/img/post/file.jpeg')
 * @returns {string} Path without the prefix (e.g., 'img/post/file.jpeg')
 */

const stripPublicPath = (fullPath) => {
  // check if the fullPath exist and starts with 'public/'
  if (fullPath && fullPath.startsWith("public/")) {
    // remove the 'public/' prefix and return the modified path
    return fullPath.substring(7); // 'public/' has 7 characters
  }

  // if the fullPath does not start with 'public/', return it unchanged
  return fullPath;
};

module.exports = stripPublicPath;
