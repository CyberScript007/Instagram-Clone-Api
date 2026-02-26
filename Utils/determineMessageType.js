// pure function to determine the message type based on the media array and callEvent object
const determineMessageType = (media, callEvent) => {
  // if there is a callEvent object return call_event as the message type
  if (callEvent) return "call_event";

  // if there is no media return text as the message type
  if (!media || media.length === 0 || !callEvent) return "text";

  //  create a set to store the unique media types
  const uniqueMediaTypes = new Set(media.map((item) => item.mediaType));

  // convert the set to an array
  const mediaTypesArray = Array.from(uniqueMediaTypes);

  // if the lenght of the mediaTypesArray is greater than 1 return media as the message type
  if (mediaTypesArray.length > 1) return "media";

  // if there is only one media type return that media type as the message type
  return mediaTypesArray[0];
};

module.exports = determineMessageType;
