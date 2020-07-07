const mail = require('../mail').events
const server = require('./server')
const login = require('./login')
const signup = require('./signup')
const tape = require('tape')
const verifyLogIn = require('./verify-login')
const webdriver = require('./webdriver')

tape('change e-mail', test => {
  const name = 'Ana Tester'
  const location = 'US-CA'
  const handle = 'tester'
  const password = 'test password'
  const oldEMail = 'old@example.com'
  const newEMail = 'new@example.com'
  server((port, done) => {
    let browser
    webdriver()
      .then(loaded => { browser = loaded })
      // Sign up.
      .then(() => new Promise((resolve, reject) => {
        signup({
          browser, port, name, location, handle, password, email: oldEMail
        }, error => {
          if (error) return reject(error)
          resolve()
        })
      }))
      .then(() => login({
        browser, port, handle, password
      }))
      .then(() => verifyLogIn({
        browser, port, test, handle, email: oldEMail
      }))
      // Navigate to password-change page.
      .then(() => browser.navigateTo('http://localhost:' + port))
      .then(() => browser.$('a=Account'))
      .then(a => a.click())
      .then(() => browser.$('a=Change E-Mail'))
      .then(a => a.click())
      // Submit password-change form.
      .then(() => browser.$('#emailForm input[name="email"]'))
      .then(input => input.addValue(newEMail))
      .then(() => {
        mail.once('sent', options => {
          test.equal(options.to, newEMail, 'TO: new email')
          test.assert(options.subject.includes('Confirm'), 'Confirm')
          const url = /<(http:\/\/[^ ]+)>/.exec(options.text)[1]
          browser.navigateTo(url)
            .then(() => browser.$('p.message'))
            .then(p => p.getText())
            .then(text => {
              test.assert(text.includes('changed'), 'changed')
              test.end()
              done()
            })
        })
      })
      .then(() => browser.$('#emailForm button[type="submit"]'))
      .then(submit => submit.click())
      .catch(error => {
        test.fail(error, 'catch')
        finish()
      })
    function finish () {
      test.end()
      done()
    }
  })
})

tape('change e-mail to existing', test => {
  const name = 'Ana Tester'
  const location = 'US-CA'
  const handle = 'tester'
  const password = 'test password'
  const email = 'test@example.com'
  server((port, done) => {
    let browser
    webdriver()
      .then(loaded => { browser = loaded })
      .then(() => new Promise((resolve, reject) => {
        signup({
          browser, port, name, location, handle, password, email
        }, error => {
          if (error) return reject(error)
          resolve()
        })
      }))
      .then(() => login({
        browser, port, handle, password
      }))
      .then(() => verifyLogIn({
        browser, port, test, handle, email
      }))
      // Navigate to password-change page.
      .then(() => browser.$('a=Account'))
      .then(a => a.click())
      .then(() => browser.$('a=Change E-Mail'))
      .then(a => a.click())
      // Submit password-change form.
      .then(() => browser.$('#emailForm input[name="email"]'))
      .then(input => input.setValue(email))
      .then(() => browser.$('#emailForm button[type="submit"]'))
      .then(submit => submit.click())
      .then(() => browser.$('.error'))
      .then(element => element.getText())
      .then(text => {
        test.assert(text.includes('already has'), 'already has')
      })
      .then(finish)
      .catch(error => {
        test.fail(error, 'catch')
        finish()
      })
    function finish () {
      test.end()
      done()
    }
  })
})
