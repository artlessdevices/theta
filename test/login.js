const assert = require('assert')

module.exports = (options, callback) => {
  assert(options.browser)
  assert(Number.isSafeInteger(options.port))
  assert(typeof options.handle === 'string')
  assert(typeof options.password === 'string')
  const browser = options.browser
  const port = options.port
  const handle = options.handle
  const password = options.password
  return browser.navigateTo('http://localhost:' + port)
    .then(() => browser.$('#login'))
    .then(a => a.click())
    .then(() => browser.$('#loginForm input[name="handle"]'))
    .then(input => input.addValue(handle))
    .then(() => browser.$('#loginForm input[name="password"]'))
    .then(input => input.addValue(password))
    .then(() => browser.$('#loginForm button[type="submit"]'))
    .then(submit => submit.click())
    .catch(callback)
}
