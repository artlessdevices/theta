const createProject = require('./create-project')
const http = require('http')
const login = require('./login')
const logout = require('./logout')
const server = require('./server')
const signup = require('./signup')
const simpleConcat = require('simple-concat')
const tape = require('tape')
const timeout = require('./timeout')
const webdriver = require('./webdriver')

const project = 'apple'
const url = 'http://example.com'
const price = 11
const category = 'library'

tape('user page', test => {
  const name = 'Ana Tester'
  const location = 'US-CA'
  const handle = 'ana'
  const password = 'ana password'
  const email = 'ana@example.com'
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
      .then(() => createProject({ browser, port, project, url, price, category }))
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

tape('user page licenses', test => {
  const ana = {
    name: 'Ana Tester',
    location: 'US-CA',
    handle: 'ana',
    password: 'ana password',
    email: 'ana@example.com'
  }
  const bob = {
    name: 'Bob Tester',
    location: 'US-NY',
    handle: 'bob',
    password: 'bob password',
    email: 'bob@example.com'
  }
  server((port, done) => {
    let browser, cardNumber
    webdriver()
      .then(loaded => { browser = loaded })
      .then(() => {
        return new Promise((resolve, reject) => signup(
          Object.assign({}, ana, { browser, port }),
          error => {
            if (error) reject(error)
            resolve()
          }
        ))
      })
      .then(() => login({ browser, port, handle: ana.handle, password: ana.password }))
      // Connect.
      .then(() => browser.$('#account'))
      .then(account => account.click())
      .then(() => browser.$('#connect'))
      .then(connect => connect.click())
      .then(() => browser.$('=Skip this account form'))
      .then((element) => element.click())
      // Confirm connected.
      .then(() => browser.$('#disconnect'))
      .then(disconnect => disconnect.getText())
      .then(text => test.equal(text, 'Disconnect Stripe Account', 'connected'))
      // Create project.
      .then(() => createProject({
        browser, port, project, url, price, category
      }))
      .then(() => logout({ browser, port }))
      // As Bob...
      .then(() => {
        return new Promise((resolve, reject) => signup(
          Object.assign({}, bob, { browser, port }),
          error => {
            if (error) reject(error)
            resolve()
          }
        ))
      })
      .then(() => login({ browser, port, handle: bob.handle, password: bob.password }))
      // Buy a license.
      .then(() => browser.navigateTo(`http://localhost:${port}/~${ana.handle}/${project}`))
      // Confirm customer details are already prefilled.
      .then(() => browser.$('#buyForm input[name=name]'))
      .then(name => name.getValue())
      .then(value => test.equal(value, bob.name, 'prefilled name'))
      .then(() => browser.$('#buyForm input[name=email]'))
      .then(email => email.getValue())
      .then(value => test.equal(value, bob.email, 'prefilled e-mail'))
      .then(() => browser.$('#buyForm input[name=location]'))
      .then(location => location.getValue())
      .then(value => test.equal(value, bob.location, 'prefilled location'))
      // Enter credit card information.
      .then(() => browser.$('iframe'))
      .then((frame) => browser.switchToFrame(frame))
      .then(() => browser.$('input[name="cardnumber"]'))
      .then((input) => { cardNumber = input })
      .then(() => cardNumber.addValue('42'))
      .then(() => timeout(200))
      .then(() => cardNumber.addValue('42'))
      .then(() => timeout(200))
      .then(() => cardNumber.addValue('42'))
      .then(() => timeout(200))
      .then(() => cardNumber.addValue('42'))
      .then(() => timeout(200))
      .then(() => cardNumber.addValue('42'))
      .then(() => timeout(200))
      .then(() => cardNumber.addValue('42'))
      .then(() => timeout(200))
      .then(() => cardNumber.addValue('42'))
      .then(() => timeout(200))
      .then(() => cardNumber.addValue('42'))
      .then(() => browser.$('input[name="exp-date"]'))
      .then((input) => input.setValue('10 / 31'))
      .then(() => browser.$('input[name="cvc"]'))
      .then((input) => input.setValue('123'))
      .then(() => browser.$('input[name="postal"]'))
      .then((input) => input.setValue('12345'))
      .then(() => browser.switchToParentFrame())
      // Accept terms.
      .then(() => browser.$('#buyForm input[name=terms]'))
      .then(terms => terms.click())
      .then(() => browser.$('#buyForm button[type=submit]'))
      .then(submit => submit.click())
      .then(() => browser.$('.message'))
      .then(message => message.waitForExist({ timeout: 10000 }))
      .then(() => browser.$('.message'))
      .then(message => message.getText())
      .then(text => test.assert(text.includes('Thank you', 'confirmation')))
      .then(() => timeout(5000))
      // Browse to Bob's user page.
      .then(() => browser.navigateTo(`http://localhost:${port}/~${bob.handle}`))
      .then(() => browser.$('main .licenses a'))
      .then(a => a.getAttribute('href'))
      .then(href => test.equal(href, `/~${ana.handle}/${project}`))
      .then(finish)
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

tape('user JSON', test => {
  const name = 'Ana Tester'
  const location = 'US-CA'
  const handle = 'ana'
  const password = 'ana password'
  const email = 'ana@example.com'
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
