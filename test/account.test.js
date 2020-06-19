const http = require('http')
const server = require('./server')
const login = require('./login')
const signup = require('./signup')
const tape = require('tape')
const verifyLogIn = require('./verify-login')
const webdriver = require('./webdriver')

const path = '/account'

tape('GET ' + path, test => {
  server((port, done) => {
    http.request({ path, port })
      .once('response', response => {
        test.equal(response.statusCode, 302, '302')
        test.equal(response.headers.location, '/login', 'redirect')
        test.end()
        done()
      })
      .end()
  })
})

tape('browse ' + path, test => {
  const handle = 'ana'
  const password = 'ana password'
  const email = 'ana@example.com'
  server((port, done) => {
    let browser
    webdriver()
      .then(loaded => { browser = loaded })
      .then(() => {
        return new Promise((resolve, reject) => signup({
          browser, port, handle, password, email
        }, error => {
          if (error) reject(error)
          resolve()
        }))
      })
      .then(() => login({ browser, port, handle, password }))
      .then(() => verifyLogIn({ browser, test, port, email, handle }))
      .then(() => finish())
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
