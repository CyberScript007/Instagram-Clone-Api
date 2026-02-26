const nodemailer = require("nodemailer");

class Email {
  constructor(user) {
    this.to = user.email;
    this.from = process.env.EMAIL_FROM;
    this.user = user;
  }

  emailTransporter() {
    return nodemailer.createTransport({
      host: "sandbox.smtp.mailtrap.io",
      port: 2525,
      auth: {
        user: process.env.EMAIL_MAILTRAP_USERNAME,
        pass: process.env.EMAIL_MAILTRAP_PASSWORD,
      },
    });
  }

  async send(subject, message) {
    const mailObj = {
      from: this.from,
      to: this.to,
      subject,
      text: message,
    };

    await this.emailTransporter().sendMail(mailObj);
  }

  async sendWelcome() {
    await this.send(
      "Welcome to Instagram",
      `Hi ${this.user.name}, welcome to Instagram! We are glad to have you here.`
    );
  }

  async sendReactivateAccount() {
    await this.send(
      "Your account has been reactivated",
      `Hi ${this.user.name}, your account has been reactivated. You can now log in to your account.`
    );
  }

  async sendOtp(otp) {
    await this.send(
      `${otp} is your instagram code`,
      `Hi, someone tried to sign up for an instagram account with ${this.user.email}. If it was you, enter this comfirmation code in the app. ${otp} is your instagram code. If it was not you, please ignore this email.`
    );
  }

  async sendContentHidden(report) {
    await this.send(
      `Your ${report.contentType} has been hidden`,
      `Hi ${this.user.name}, your ${report.contentType} has been hidden due to this reason: ${report.reason}. If you believe this is a mistake, please contact support. Thank you for your understanding.`
    );
  }

  async sendContentVisible(appeal) {
    await this.send(
      `Your ${appeal.contentType} is now visible`,
      `Hi ${this.user.name}, we are writing to let you know that your ${appeal.contentType} has been made visible again. We have reviewed your content and have determined it no longer violates our community guidelines. Thank you for your understanding.`
    );
  }

  async sendAccountSuspended(report) {
    const futureDate = this.user.bannedUntil;
    const formattedDate = futureDate.toDateString();
    const formattedTime = futureDate.toLocaleTimeString("en-Us", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });

    const formattedDateTime = `${formattedDate} at ${formattedTime}`;

    await this.send(
      "Your account has been suspended",
      `Hi ${this.user.name}, your account has been suspended due to this reason ${report.reason}. If you believe this is a mistake, please contact support. Your account will suspended until ${formattedDateTime}. Thank you for your understanding.`
    );
  }

  async sendAccountWarning(report) {
    await this.send(
      "Your account has been warned",
      `Hi ${this.user.name}, your account has been warned due to this reason ${report.reason}. This is a warning and your account will not be suspended. If you continue to violate our policies, your account will be suspended. Thank you for your understanding.`
    );
  }

  async sendAccountDeleted(report) {
    await this.send(
      "Your account has been deleted",
      `Hi ${this.user.name}, your account has been deleted due to policy violation. If you believe this is a mistake, please contact support. Thank you for your understanding.`
    );
  }

  async sendAppealSubmitted() {
    await this.send(
      "Your appeal has been submitted",
      `Hi ${this.user.name}, your appeal has been submitted successfully. We will review your appeal and get back to you as soon as possible. Thank you for your patience.`
    );
  }

  async sendAppealAccepted(appeal) {
    await this.send(
      `Your appeal has been accepted`,
      `Hi ${this.user.name}, we are writing to let you know that your recent appeal has been reviewed and accepted. We have restored your ${appeal.contentType} or reactivated your account. Thank you for your patience.`
    );
  }

  async sendAppealRejected(appeal) {
    await this.send(
      `Your appeal has been rejected`,
      `Hi ${this.user.name}, we are writing to let you know that your recent appeal has been reviewed and rejected. We have determined that our original action was correct and your ${appeal.contentType} or account will remain hidden or suspended due to a violation of our community guidelines. Thank you for your understanding.`
    );
  }
}

module.exports = Email;
