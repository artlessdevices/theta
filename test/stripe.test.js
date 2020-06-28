const login = require('./login')
const server = require('./server')
const signup = require('./signup')
const tape = require('tape')
const timeout = require('./timeout')
const webdriver = require('./webdriver')

tape('Stripe Connect', test => {
  const handle = 'tester'
  const password = 'test password'
  const email = 'tester@example.com'
  server((port, done) => {
    let browser
    webdriver()
      .then(loaded => { browser = loaded })
      .then(() => new Promise((resolve, reject) => {
        signup({
          browser, port, handle, password, email
        }, error => {
          if (error) return reject(error)
          resolve()
        })
      }))
      .then(() => login({ browser, port, handle, password }))
      // Navigate to account page.
      .then(() => browser.$('#account'))
      .then(account => account.click())
      // Connect.
      .then(() => browser.$('#connect'))
      .then(connect => connect.click())
      .then(() => browser.$('=Skip this account form'))
      .then((element) => element.click())
      // Confirm connected.
      .then(() => browser.$('#disconnect'))
      .then(disconnect => disconnect.getText())
      .then(text => test.equal(text, 'Disconnect Stripe Account', 'connected'))
      // Disconnect.
      .then(() => browser.$('#disconnect'))
      .then(disconnect => disconnect.click())
      .then(() => browser.$('h2'))
      .then(h2 => h2.getText())
      .then(text => test.equal(text, 'Disconnected Stripe Account', 'disconnected'))
      .then(() => timeout(5000))
      // Navigate back to account page.
      .then(() => browser.$('#account'))
      .then(account => account.click())
      // Confirm disconnected.
      .then(() => browser.$('#connect'))
      .then(connect => connect.getText())
      .then(text => test.equal(text, 'Connect Stripe Account', 'confirmed disconnected'))
      // Finish.
      .then(() => finish())
      .catch(error => {
        test.fail(error, 'catch')
        finish()
      })
    function finish () {
      test.end()
      done()
    }
  }, 8080)
})
