const assert = require('assert')
const mail = require('../mail').events

module.exports = ({
  name,
  location,
  handle,
  password,
  email,
  browser,
  port
}, callback) => {
  assert(browser)
  assert(Number.isSafeInteger(port))
  assert(typeof name === 'string')
  assert(typeof location === 'string')
  assert(typeof handle === 'string')
  assert(typeof password === 'string')
  assert(typeof email === 'string')
  browser.navigateTo('http://localhost:' + port)
    .then(() => browser.$('a=Sign Up'))
    .then(a => a.click())
    .then(() => browser.$('#signupForm input[name="name"]'))
    .then(input => input.addValue(name))
    .then(() => browser.$('#signupForm input[name="location"]'))
    .then(input => input.addValue(location))
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
