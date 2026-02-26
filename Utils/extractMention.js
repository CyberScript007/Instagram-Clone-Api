const extractMention = function (text) {
  // regqx to extract any text start with @ e.g @yamal
  const mentionRegEx = /@([\w\d_]+)/g;

  // create an array where the value extracted to be store
  const mentions = [];

  // store the value been extracted
  let match;

  // store both extracted text and the value of the parameters passed in. yamal and @yamal
  while ((match = mentionRegEx.exec(text)) !== null) {
    // push only the extracted text into mentions array
    mentions.push(match[1]);
  }

  return mentions;
};

module.exports = extractMention;
