const createProject = require('./create-project')
const http = require('http')
const login = require('./login')
const server = require('./server')
const signup = require('./signup')
const simpleConcat = require('simple-concat')
const tape = require('tape')
const webdriver = require('./webdriver')

const name = 'Ana Tester'
const location = 'US-CA'
const handle = 'ana'
const password = 'ana password'
const email = 'ana@example.com'
const project = 'apple'
const url = 'http://example.com'
const price = 11

tape('user page', test => {
  server((port, done) => {
    let browser
    webdriver()
      .then(loaded => { browser = loaded })
      .then(() => {
        return new Promise((resolve, reject) => signup({
          browser, port, name, location, handle, password, email
        }, error => {
          if (error) reject(error)
          resolve()
        }))
      })
      // Browse user page.
      .then(() => browser.navigateTo(`http://localhost:${port}/~${handle}`))
      .then(() => browser.$('h2'))
      .then(h2 => h2.getText())
      .then(text => test.equal(text, handle, 'handle'))
      // Create project.
      .then(() => login({ browser, port, handle, password }))
      .then(() => createProject({ browser, port, project, url, price }))
      // Find project link on user page.
      .then(() => browser.navigateTo(`http://localhost:${port}/~${handle}`))
      .then(() => browser.$('.projects'))
      .then(projects => projects.$(`=${project}`))
      .then(link => link.waitForExist())
      .then(() => browser.saveScreenshot('../test.png'))
      .then(() => test.pass('project link on user page'))
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

tape('user JSON', test => {
  server((port, done) => {
    let browser
    webdriver()
      .then(loaded => { browser = loaded })
      .then(() => {
        return new Promise((resolve, reject) => signup({
          browser, port, name, location, handle, password, email
        }, error => {
          if (error) reject(error)
          resolve()
        }))
      })
      // Create project.
      .then(() => login({ browser, port, handle, password }))
      .then(() => browser.$('=Account'))
      .then(account => account.click())
      .then(() => browser.$('=Create Project'))
      .then(create => create.click())
      .then(() => browser.$('#createForm input[name="project"]'))
      .then(input => input.addValue(project))
      .then(() => browser.$('#createForm input[name="url"]'))
      .then(input => input.addValue('http://example.com'))
      .then(() => browser.$('#createForm button[type="submit"]'))
      .then(submit => submit.click())
      .then(() => {
        http.request({
          port,
          path: `/~${handle}`,
          headers: { Accept: 'application/json' }
        })
          .once('response', response => {
            test.equal(response.statusCode, 200, '200')
            simpleConcat(response, (error, buffer) => {
              test.ifError(error, 'no read error')
              const parsed = JSON.parse(buffer)
              test.equal(parsed.handle, handle, '.handle')
              test.equal(parsed.email, email, '.email')
              test.equal(typeof parsed.created, 'string', '.created')
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
