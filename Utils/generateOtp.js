const speakeasy = require("speakeasy");

const generateOtp = () => {
  return speakeasy.totp({
    secret: process.env.OTP_NUMBER_SECRET,
    encoding: "base32",
    digits: 6,
  });
};

module.exports = generateOtp;
