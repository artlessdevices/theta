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
    (async () => {
      const browser = await webdriver()
      await new Promise((resolve, reject) => signup({
        browser, port, name, location, handle, password, email
      }, error => {
        if (error) reject(error)
        resolve()
      }))

      // Browse user page.
      await browser.navigateTo(`http://localhost:${port}/~${handle}`)
      const h2 = await browser.$('h2')
      const h2Text = await h2.getText()
      test.equal(h2Text, handle, 'handle')

      // Create project.
      await login({ browser, port, handle, password })
      await createProject({ browser, port, project, url, price, category })

      // Find project link on user page.
      await browser.navigateTo(`http://localhost:${port}/~${handle}`)
      const projects = await browser.$('.projects')
      const link = await projects.$(`=${project}`)
      await link.waitForExist()
      test.pass('project link on user page')
    })()
      .then(finish)
      .catch(finish)
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
    (async () => {
      const browser = await webdriver()
      await new Promise((resolve, reject) => signup(
        Object.assign({}, ana, { browser, port }),
        error => {
          if (error) reject(error)
          resolve()
        }
      ))
      await login({ browser, port, handle: ana.handle, password: ana.password })

      // Connect.
      const accountLink = await browser.$('#account')
      await accountLink.click()
      const connectLink = await browser.$('#connect')
      await connectLink.click()
      const skipLink = await browser.$('=Skip this account form')
      await skipLink.click()

      // Confirm connected.
      const disconnect = await browser.$('#disconnect')
      await disconnect.waitForExist()

      // Create project.
      await createProject({ browser, port, project, url, price, category })
      await logout({ browser, port })

      // As Bob...
      await new Promise((resolve, reject) => signup(
        Object.assign({}, bob, { browser, port }),
        error => {
          if (error) reject(error)
          resolve()
        }
      ))
      await login({ browser, port, handle: bob.handle, password: bob.password })

      // Buy a license.
      await browser.navigateTo(`http://localhost:${port}/~${ana.handle}/${project}`)

      // Confirm customer details are already prefilled.
      const nameInput = await browser.$('#buyForm input[name=name]')
      const nameValue = await nameInput.getValue()
      test.equal(nameValue, bob.name, 'prefilled name')

      const emailInput = await browser.$('#buyForm input[name=email]')
      const emailValue = await emailInput.getValue()
      test.equal(emailValue, bob.email, 'prefilled e-mail')

      const locationInput = await browser.$('#buyForm input[name=location]')
      const locationValue = await locationInput.getValue()
      test.equal(locationValue, bob.location, 'prefilled location')

      // Enter credit card information.
      const iframe = await browser.$('iframe')
      await browser.switchToFrame(iframe)
      const card = await browser.$('input[name="cardnumber"]')
      await card.addValue('42')
      await timeout(200)
      await card.addValue('42')
      await timeout(200)
      await card.addValue('42')
      await timeout(200)
      await card.addValue('42')
      await timeout(200)
      await card.addValue('42')
      await timeout(200)
      await card.addValue('42')
      await timeout(200)
      await card.addValue('42')
      await timeout(200)
      await card.addValue('42')
      await timeout(200)

      const expirationInput = await browser.$('input[name="exp-date"]')
      await expirationInput.setValue('10 / 31')

      const cvcInput = await browser.$('input[name="cvc"]')
      await cvcInput.setValue('123')

      const postalInput = await browser.$('input[name="postal"]')
      await postalInput.setValue('12345')

      await browser.switchToParentFrame()

      // Accept terms.
      const termsBox = await browser.$('#buyForm input[name=terms]')
      await termsBox.click()

      const submitButton = await browser.$('#buyForm button[type=submit]')
      await submitButton.click()

      const message = await browser.$('.message')
      await message.waitForExist({ timeout: 10000 })
      const messageText = await message.getText()
      test.assert(messageText.includes('Thank you', 'confirmation'))
      await timeout(5000)

      // Browse to Bob's user page.
      await browser.navigateTo(`http://localhost:${port}/~${bob.handle}`)
      const anchor = await browser.$('main .licenses a')
      const href = await anchor.getAttribute('href')
      test.equal(href, `/~${ana.handle}/${project}`)
    })()
      .then(finish)
      .catch(finish)
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
    (async () => {
      const browser = await webdriver()
      await new Promise((resolve, reject) => signup({
        browser, port, name, location, handle, password, email
      }, error => {
        if (error) reject(error)
        resolve()
      }))
      // Create project.
      await login({ browser, port, handle, password })
      const accountLink = await browser.$('=Account')
      await accountLink.click()
      const createInput = await browser.$('=Create Project')
      await createInput.click()
      const projectInput = await browser.$('#createForm input[name="project"]')
      await projectInput.addValue(project)
      const urlInput = await browser.$('#createForm input[name="url"]')
      await urlInput.addValue('http://example.com')
      const submitButton = await browser.$('#createForm button[type="submit"]')
      await submitButton.click()
    })()
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
      .catch(finish)
    function finish () {
      test.end()
      done()
    }
  })
})
