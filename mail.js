// Send E-Mail

/* istanbul ignore if */
if (process.env.NODE_ENV === 'production') {
  const nodemailer = require('nodemailer')
  const transport = nodemailer.createTransport({
    pool: true,
    host: process.env.SMTP_HOST || 'localhost',
    port: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : 587,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD
    }
  })
  module.exports = transport.sendMail.bind(transport)
} else /* in testing */ {
  // Send messages to an EventEmitter.
  const EventEmitter = require('events').EventEmitter
  const emitter = new EventEmitter()
  module.exports = (options, callback) => {
    // This delay prevents tests from visiting account-confirmation
    // pages before the app has time to persist the tokens.
    setTimeout(() => {
      emitter.emit('sent', options)
      callback()
    }, 1000)
  }
  module.exports.events = emitter
}
