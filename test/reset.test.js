const http = require('http')
const mail = require('../mail').events
const server = require('./server')
const signup = require('./signup')
const tape = require('tape')
const verifyLogIn = require('./verify-login')
const webdriver = require('./webdriver')

const path = '/reset'

tape('GET ' + path, test => {
  server((port, done) => {
    http.request({ path, port })
      .once('response', response => {
        test.equal(response.statusCode, 200, '200')
        test.end()
        done()
      })
      .end()
  })
})

tape('reset password', test => {
  const name = 'Ana Tester'
  const location = 'US-CA'
  const handle = 'tester'
  const password = 'test password'
  const email = 'tester@example.com'
  server((port, done) => {
    let browser
    webdriver()
      .then(loaded => { browser = loaded })
      .then(() => {
        signup({
          browser, port, name, location, handle, password, email
        }, error => {
          test.ifError(error, 'no signup error')
          browser.navigateTo('http://localhost:' + port)
            .then(() => browser.$('#login'))
            .then(a => a.click())
            .then(() => browser.$('a=Reset Password'))
            .then(a => a.click())
            .then(() => browser.$('#resetForm input[name="handle"]'))
            .then(input => input.addValue(handle))
            .then(() => browser.$('#resetForm button[type="submit"]'))
            .then(submit => submit.click())
            .catch(error => {
              test.fail(error, 'catch')
              finish()
            })
          mail.once('sent', options => {
            test.equal(options.to, email, 'sent mail')
            test.assert(options.subject.includes('Reset'), 'reset')
            const url = /<(http:\/\/[^ ]+)>/.exec(options.text)[1]
            browser.navigateTo(url)
              // Fill reset form.
              .then(() => browser.$('#passwordForm input[name="password"]'))
              .then(input => input.addValue(password))
              .then(() => browser.$('#passwordForm input[name="repeat"]'))
              .then(input => input.addValue(password))
              .then(() => browser.$('#passwordForm button[type="submit"]'))
              .then(submit => submit.click())
              // Navigate to log-in form.
              .then(() => browser.$('#login'))
              .then(a => a.click())
              // Fill log-in form.
              .then(() => browser.$('#loginForm input[name="handle"]'))
              .then(input => input.addValue(handle))
              .then(() => browser.$('#loginForm input[name="password"]'))
              .then(input => input.addValue(password))
              .then(() => browser.$('#loginForm button[type="submit"]'))
              .then(submit => submit.click())
              .then(() => verifyLogIn({
                browser, port, test, handle, email
              }))
              .then(() => finish())
              .catch(error => {
                test.fail(error, 'catch')
                finish()
              })
          })
        })
      })
    function finish () {
      test.end()
      done()
    }
  })
})
