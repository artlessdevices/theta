const login = require('./login')
const server = require('./server')
const signup = require('./signup')
const tape = require('tape')
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
      // Connect.
      .then(account => account.click())
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
      // Confirm disconnected.
      .then(() => browser.$('h2'))
      .then(h2 => h2.getText())
      .then(text => test.equal(text, 'Disconnected Stripe Account', 'disconnected'))
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
