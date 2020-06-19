const assert = require('assert')
const mail = require('../mail').events

module.exports = (options, callback) => {
  assert(options.browser)
  assert(Number.isSafeInteger(options.port))
  assert(typeof options.handle === 'string')
  assert(typeof options.password === 'string')
  assert(typeof options.email === 'string')
  const browser = options.browser
  const port = options.port
  const handle = options.handle
  const password = options.password
  const email = options.email
  browser.navigateTo('http://localhost:' + port)
    .then(() => browser.$('a=Sign Up'))
    .then(a => a.click())
    .then(() => browser.$('#signupForm input[name="email"]'))
    .then(input => input.addValue(email))
    .then(() => browser.$('#signupForm input[name="handle"]'))
    .then(input => input.addValue(handle))
    .then(() => browser.$('#signupForm input[name="password"]'))
    .then(input => input.addValue(password))
    .then(() => browser.$('#signupForm input[name="repeat"]'))
    .then(input => input.addValue(password))
    .then(() => browser.$('#signupForm button[type="submit"]'))
    .then(submit => submit.click())
    .catch(callback)
  mail.once('sent', options => {
    if (!options.subject.includes('Confirm')) {
      return callback(new Error('no confirmation e-mail'))
    }
    const url = /<(http:\/\/[^ ]+)>/.exec(options.text)[1]
    browser.navigateTo(url)
      .then(() => { callback() })
      .catch(callback)
  })
}
