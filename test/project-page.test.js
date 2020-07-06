const createProject = require('./create-project')
const http = require('http')
const login = require('./login')
const mail = require('../mail')
const server = require('./server')
const signup = require('./signup')
const simpleConcat = require('simple-concat')
const tape = require('tape')
const timeout = require('./timeout')
const webdriver = require('./webdriver')

const handle = 'ana'
const password = 'ana password'
const email = 'ana@example.com'
const project = 'apple'
const url = 'http://example.com'
const price = 100
const category = 'library'

tape('project page', test => {
  const customerName = 'Jon Doe'
  const customerEMail = 'jon@exaple.com'
  const customerJurisdiction = 'US-CA'
  server((port, done) => {
    let browser, cardNumber
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
      .then(() => createProject({ browser, port, project, url, price, category }))
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
      .then(() => browser.$('#category'))
      .then(price => price.getText())
      .then(text => test.equal(text, category, 'category'))
      // Buy a license.
      // Fill in customer details.
      .then(() => browser.$('#buyForm input[name=name]'))
      .then(name => name.addValue(customerName))
      .then(() => browser.$('#buyForm input[name=email]'))
      .then(email => email.addValue(customerEMail))
      .then(() => browser.$('#buyForm input[name=jurisdiction]'))
      .then(email => email.addValue(customerJurisdiction))
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
      // Listen for customer e-mail.
      .then(() => {
        mail.events.on('sent', options => {
          if (options.to !== customerEMail) return
          test.equal(options.to, customerEMail, 'e-mail TO customer')
          test.equal(options.cc, email, 'e-mail CC developer')
          test.assert(
            options.text.includes(`$${price}`),
            'e-mail includes price'
          )
          test.assert(
            options.attachments.length > 0,
            'e-mail has attachment'
          )
          readyToFinish()
        })
      })
      // Click the buy button.
      .then(() => browser.$('#buyForm button[type=submit]'))
      .then(submit => submit.click())
      .then(() => browser.$('.message'))
      .then(message => message.waitForExist({ timeout: 10000 }))
      .then(() => browser.$('.message'))
      .then(message => message.getText())
      .then(text => test.assert(text.includes('Thank you', 'confirmation')))
      .then(() => readyToFinish())
      .catch(error => {
        failed = true
        test.fail(error, 'catch')
        finish()
      })

    let failed = false
    let count = 0

    function readyToFinish () {
      if (failed) return
      if (++count === 2) {
        browser.navigateTo(`http://localhost:${port}/~${handle}/${project}`)
          .then(() => browser.$('#customers li img'))
          .then(li => li.getAttribute('alt'))
          .then(alt => test.equal(alt, customerName, 'Gravatar on project page'))
          .then(finish)
          .catch(finish)
      }
    }

    function finish () {
      test.end()
      done()
    }
  }, 8080)
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
      .then(() => createProject({ browser, port, project, url, price, category }))
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
              test.equal(parsed.category, category, '.category')
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
