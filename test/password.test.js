const mail = require('../mail').events
const server = require('./server')
const signup = require('./signup')
const tape = require('tape')
const verifyLogIn = require('./verify-login')
const webdriver = require('./webdriver')

tape('change password', test => {
  const handle = 'tester'
  const oldPassword = 'old password'
  const newPassword = 'new password'
  const email = 'tester@example.com'
  server((port, done) => {
    let browser
    webdriver()
      .then(loaded => { browser = loaded })
      .then(() => {
        signup({
          browser, port, handle, password: oldPassword, email
        }, error => {
          test.ifError(error, 'no signup error')
          browser.navigateTo('http://localhost:' + port)
            // Navigate to log-in page.
            .then(() => browser.$('#login'))
            .then(a => a.click())
            // Sign in.
            .then(() => browser.$('#loginForm input[name="handle"]'))
            .then(input => input.addValue(handle))
            .then(() => browser.$('#loginForm input[name="password"]'))
            .then(input => input.addValue(oldPassword))
            .then(() => browser.$('#loginForm button[type="submit"]'))
            .then(submit => submit.click())
            // Navigate to password-change page.
            .then(() => browser.$('a=Account'))
            .then(a => a.click())
            .then(() => browser.$('a=Change Password'))
            .then(a => a.click())
            // Submit password-change form.
            .then(() => browser.$('#passwordForm input[name="old"]'))
            .then(input => input.addValue(oldPassword))
            .then(() => browser.$('#passwordForm input[name="password"]'))
            .then(input => input.addValue(newPassword))
            .then(() => browser.$('#passwordForm input[name="repeat"]'))
            .then(input => input.addValue(newPassword))
            .then(() => {
              mail.once('sent', options => {
                test.equal(options.to, email, 'email')
                test.assert(options.subject.includes('Password'), 'Password')
              })
            })
            .then(() => browser.$('#passwordForm button[type="submit"]'))
            .then(submit => submit.click())
            .then(() => browser.$('p.message'))
            .then(p => p.getText())
            .then(text => {
              test.assert(text.includes('changed'), 'changed')
            })
            // Sign out.
            .then(() => browser.$('#logout'))
            .then(a => a.click())
            .then(() => browser.$('#login'))
            .then(a => a.click())
            // Sign in with new password.
            .then(() => browser.$('#loginForm input[name="handle"]'))
            .then(input => input.addValue(handle))
            .then(() => browser.$('#loginForm input[name="password"]'))
            .then(input => input.addValue(newPassword))
            .then(() => browser.$('#loginForm button[type="submit"]'))
            .then(submit => submit.click())
            .then(() => verifyLogIn({
              browser, test, port, handle, email
            }))
            .then(() => {
              test.end()
              done()
            })
            .catch(error => {
              test.fail(error, 'catch')
              finish()
            })
        })
      })
    function finish () {
      test.end()
      done()
    }
  })
})
