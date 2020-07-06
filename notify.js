// Send E-Mail Nofications

const constants = require('./constants')
const mail = require('./mail')
const markdown = require('./markdown')

exports.confirmEMail = ({ to, handle, url }, callback) => {
  const text = `
  `.trim()
  const html = markdown(text)
  send({
    to,
    subject: `Confirm ${constants.website} Account`,
    markup: `
Follow this link to confirm your ${constants.website} account:

<${url}>
    `.trim(),
    text,
    html
  }, callback)
}

exports.passwordReset = ({ to, handle, url }, callback) => {
  send({
    to,
    subject: `Reset ${constants.website} Password`,
    markup: `
To reset the password for your ${constants.website} account, follow this link:

<${url}>
    `.trim()
  }, callback)
}

exports.passwordChanged = ({ to }, callback) => {
  send({
    to,
    subject: `${constants.website} Password Change`,
    markup: `
The password for your ${constants.website} account on was changed.
    `.trim()
  }, callback)
}

exports.handleReminder = ({ to, handle }, callback) => {
  send({
    to,
    subject: `Your ${constants.website} Handle`,
    markup: `Your handle on ${constants.website} is "${handle}".`
  }, callback)
}

exports.changeEMail = ({ to, url }, callback) => {
  send({
    to,
    subject: `Confirm ${constants.website} E-Mail Change`,
    markup: `
To confirm the new e-mail address for your ${constants.website} account, follow this link:

<${url}>
    `.trim()
  }, callback)
}

exports.connectedStripe = ({ to }, callback) => {
  send({
    to,
    subject: `Stripe Account Connected to ${constants.website}`,
    markup: `
You've successfully connected your Stripe account to your ${constants.website} account.
    `.trim()
  }, callback)
}

exports.license = ({
  to,
  cc,
  bcc,
  handle,
  project,
  price,
  docxBuffer
}, callback) => {
  send({
    to,
    cc,
    bcc,
    subject: 'Your License',
    markup: `
Thank you for buying a license through ${constants.website}!

A copy of your license is attached.

Project: <${process.env.BASE_HREF}/~${handle}/${project}>

Price: $${price.toString()}
    `.trim(),
    attachments: [
      {
        filename: 'license.docx',
        content: docxBuffer
      }
    ]
  }, callback)
}

function send ({ to, cc, bcc, subject, markup, attachments }, callback) {
  mail({
    to,
    cc,
    bcc,
    subject,
    text: markup,
    html: markdown(markup),
    attachments
  }, callback)
}
