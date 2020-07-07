const http = require('http')
const mail = require('../mail').events
const server = require('./server')
const signup = require('util').promisify(require('./signup'))
const tape = require('tape')
const verifyLogIn = require('./verify-login')
const webdriver = require('./webdriver')

const path = '/signup'

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

tape('browse ' + path, test => {
  server((port, done) => {
    let browser
    webdriver()
      .then(loaded => { browser = loaded })
      .then(() => browser.navigateTo('http://localhost:' + port))
      .then(() => browser.$('a=Sign Up'))
      .then(a => a.click())
      .then(() => browser.$('h2'))
      .then(title => title.getText())
      .then(text => {
        test.equal(text, 'Sign Up', '<h2>Sign Up</h2>')
        finish()
      })
      .catch(error => {
        test.fail(error)
        finish()
      })
    function finish () {
      test.end()
      done()
    }
  })
})

tape('sign up', test => {
  const name = 'Super Tester'
  const location = 'US-CA'
  const email = 'test@example.com'
  const handle = 'tester'
  const password = 'test password'
  server((port, done) => {
    let browser
    webdriver()
      .then(loaded => { browser = loaded })
      .then(() => browser.navigateTo('http://localhost:' + port))
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
      .catch(error => {
        test.fail(error, 'catch')
        test.end()
        done()
      })
    mail.once('sent', options => {
      test.equal(options.to, email, 'sends e-mail')
      test.assert(options.subject.includes('Confirm'), 'subject')
      test.assert(options.text.includes('/confirm?token='), 'link')
      const url = /<(http:\/\/[^ ]+)>/.exec(options.text)[1]
      browser.navigateTo(url)
        .then(() => browser.$('a=Log In'))
        .then(a => a.click())
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
          test.fail(error)
          finish()
        })
      mail.once('sent', options => {
        test.equal(options.subject, 'Sign Up', 'admin notification')
        test.assert(options.text.includes(handle), 'includes handle')
        test.assert(options.text.includes(email), 'includes email')
      })
    })
    function finish () {
      test.end()
      done()
    }
  })
})

tape('sign up same handle', test => {
  const firstEMail = 'first@example.com'
  const secondEMail = 'first@example.com'
  const name = 'Super Tester'
  const location = 'US-CA'
  const handle = 'tester'
  const password = 'test password'
  server((port, done) => {
    let browser
    webdriver()
      .then(loaded => { browser = loaded })
      // Sign up using the handle.
      .then(() => {
        return new Promise((resolve, reject) => signup({
          browser, port, name, location, handle, password, email: firstEMail
        }, error => {
          if (error) reject(error)
          resolve()
        }))
      })
      // Try to sign up again with the same handle.
      .then(() => browser.navigateTo('http://localhost:' + port))
      .then(() => browser.$('a=Sign Up'))
      .then(a => a.click())
      .then(() => browser.$('#signupForm input[name="email"]'))
      .then(input => input.addValue(secondEMail))
      .then(() => browser.$('#signupForm input[name="handle"]'))
      .then(input => input.addValue(handle))
      .then(() => browser.$('#signupForm input[name="password"]'))
      .then(input => input.addValue(password))
      .then(() => browser.$('#signupForm input[name="repeat"]'))
      .then(input => input.addValue(password))
      .then(() => browser.$('#signupForm button[type="submit"]'))
      .then(submit => submit.click())
      .then(() => browser.$('.error'))
      .then(element => element.getText())
      .then(text => {
        test.assert(text.includes('taken'), 'handle taken')
      })
      .then(() => browser.$('input[name="email"]'))
      .then(input => input.getValue())
      .then(value => test.equal(value, secondEMail, 'preserves e-mail value'))
      .then(() => browser.$('input[name="handle"]'))
      .then(input => input.getValue())
      .then(value => test.equal(value, handle, 'preserves handle value'))
      .then(() => browser.$('input[name="password"]'))
      .then(input => input.getValue())
      .then(value => test.equal(value, '', 'empties password'))
      .then(() => browser.$('input[name="repeat"]'))
      .then(input => input.getValue())
      .then(value => test.equal(value, '', 'empties password repeat'))
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

tape('sign up same email', test => {
  const name = 'Super Tester'
  const location = 'US-CA'
  const email = 'first@example.com'
  const firstHandle = 'first'
  const secondHandle = 'second'
  const password = 'test password'
  server((port, done) => {
    let browser
    webdriver()
      .then(loaded => { browser = loaded })
      .then(() => {
        return new Promise((resolve, reject) => signup({
          browser, port, name, location, handle: firstHandle, password, email
        }, error => {
          if (error) reject(error)
          resolve()
        }))
      })
      // Try to sign up again with the same e-mail.
      .then(() => browser.navigateTo('http://localhost:' + port))
      .then(() => browser.$('a=Sign Up'))
      .then(a => a.click())
      .then(() => browser.$('#signupForm input[name="email"]'))
      .then(input => input.addValue(email))
      .then(() => browser.$('#signupForm input[name="handle"]'))
      .then(input => input.addValue(secondHandle))
      .then(() => browser.$('#signupForm input[name="password"]'))
      .then(input => input.addValue(password))
      .then(() => browser.$('#signupForm input[name="repeat"]'))
      .then(input => input.addValue(password))
      .then(() => browser.$('#signupForm button[type="submit"]'))
      .then(submit => submit.click())
      .then(() => browser.$('.error'))
      .then(element => element.getText())
      .then(text => {
        test.assert(text.includes('e-mail'), 'e-mail')
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
