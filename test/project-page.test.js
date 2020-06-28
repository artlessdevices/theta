const server = require('./server')
const login = require('./login')
const signup = require('./signup')
const tape = require('tape')
const webdriver = require('./webdriver')

tape('project page', test => {
  const handle = 'ana'
  const password = 'ana password'
  const email = 'ana@example.com'
  const project = 'apple'
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
      .then(() => browser.$('=Account'))
      .then(account => account.click())
      .then(() => browser.$('=Create Project'))
      .then(create => create.click())
      .then(() => browser.$('#createForm input[name="project"]'))
      .then(input => input.addValue(project))
      .then(() => browser.$('#createForm button[type="submit"]'))
      .then(submit => submit.click())
      .then(() => browser.navigateTo(`http://localhost:${port}/~${handle}/${project}`))
      .then(() => browser.$('h2'))
      .then(h2 => h2.getText())
      .then(text => test.equal(text, project, 'project page'))
      .then(() => browser.saveScreenshot('../test.png'))
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
