const createProject = require('./create-project')
const http = require('http')
const login = require('./login')
const server = require('./server')
const signup = require('./signup')
const simpleConcat = require('simple-concat')
const tape = require('tape')
const webdriver = require('./webdriver')

const handle = 'ana'
const password = 'ana password'
const email = 'ana@example.com'
const project = 'apple'
const url = 'http://example.com'
const price = 11

tape('project page', test => {
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
      .then(() => createProject({ browser, port, project, url, price }))
      .then(() => browser.navigateTo(`http://localhost:${port}/~${handle}/${project}`))
      .then(() => browser.$('h2'))
      .then(h2 => h2.getText())
      .then(text => test.equal(text, project, 'project page'))
      .then(() => browser.$(`a[href="${url}"]`))
      .then(link => link.waitForExist())
      .then(() => test.pass('URL'))
      .then(() => browser.$('#price'))
      .then(price => price.getText())
      .then(text => test.equal(text, `$${price}`, 'price'))
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

tape('project JSON', test => {
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
      .then(() => createProject({ browser, port, project, url, price }))
      .then(() => {
        http.request({
          port,
          path: `/~${handle}/${project}`,
          headers: { Accept: 'application/json' }
        })
          .once('response', response => {
            test.equal(response.statusCode, 200, '200')
            simpleConcat(response, (error, buffer) => {
              test.ifError(error, 'no read error')
              const parsed = JSON.parse(buffer)
              test.equal(parsed.project, project, '.project')
              test.equal(parsed.price, price, '.price')
              test.deepEqual(parsed.urls, [url], '.urls')
              test.equal(typeof parsed.created, 'string', '.created')
              test.equal(typeof parsed.account, 'object', '.account')
              finish()
            })
          })
          .end()
      })
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
