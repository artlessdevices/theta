const createProject = require('./create-project')
const login = require('./login')
const server = require('./server')
const signup = require('./signup')
const tape = require('tape')
const timeout = require('./timeout')
const webdriver = require('./webdriver')

const name = 'Ana Tester'
const location = 'US-CA'
const handle = 'ana'
const password = 'ana password'
const email = 'ana@example.com'
const project = 'apple'
const url = 'http://example.com'
const price = 100
const category = 'library'

// https://stripe.com/docs/testing
const testNumbers = {
  4000000000000002: 'declined', // (generic decline)
  4000000000009995: 'insufficient', // insufficient_funds
  4000000000009987: 'declined', // lost_card
  4000000000009979: 'declined', // stolen_card
  4000000000000069: 'expired', // expired_card
  4000000000000127: 'security code', // incorrect_cvc
  4000000000000119: 'processing' // processing_erro
  // TODO: Test cards with client-side errors.
  // 4242424242424241: { client: true, code: 'incorrect_number' }
}

tape('declined cards', test => {
  const customerName = 'Jon Doe'
  const customerEMail = 'jon@exaple.com'
  const customerLocation = 'US-CA'
  server(async (port, done) => {
    const browser = await webdriver()
    await new Promise((resolve, reject) => signup({
      browser, port, name, location, handle, password, email
    }, error => {
      if (error) reject(error)
      resolve()
    }))
    await login({ browser, port, handle, password })
    // Connect.
    const account = await browser.$('#account')
    await account.click()
    const connect = await browser.$('#connect')
    await connect.click()
    const skip = await browser.$('=Skip this account form')
    await skip.click()
    // Confirm connected.
    const disconnect = await browser.$('#disconnect')
    const disconnectText = await disconnect.getText()
    test.equal(disconnectText, 'Disconnect Stripe Account', 'connected')
    await createProject({ browser, port, project, url, price, category })
    // Buy licenses.
    for await (const number of Object.keys(testNumbers)) {
      const groups = number.match(/.{2}/g)
      await browser.navigateTo(`http://localhost:${port}/~${handle}/${project}`)
      // Fill in customer details.
      const nameInput = await browser.$('#buyForm input[name=name]')
      await nameInput.addValue(customerName)
      const emailInput = await browser.$('#buyForm input[name=email]')
      await emailInput.addValue(customerEMail)
      const locationInput = await browser.$('#buyForm input[name=location]')
      await locationInput.addValue(customerLocation)
      // Enter credit card information.
      const iframe = await browser.$('iframe')
      await browser.switchToFrame(iframe)
      const cardNumber = await browser.$('input[name="cardnumber"]')
      for await (const group of groups) {
        await cardNumber.addValue(group)
        await timeout(200)
      }
      const expiration = await browser.$('input[name="exp-date"]')
      await expiration.setValue('10 / 31')
      const cvc = await browser.$('input[name="cvc"]')
      await cvc.setValue('123')
      const postal = await browser.$('input[name="postal"]')
      await postal.setValue('12345')
      await browser.switchToParentFrame()
      // Accept terms.
      const terms = await browser.$('#buyForm input[name=terms]')
      await terms.click()
      // Click the buy button.
      const submit = await browser.$('#buyForm button[type=submit]')
      await submit.click()
      const error = await browser.$('.error')
      await error.waitForExist({ timeout: 10000 })
      const errorText = await error.getText()
      const watchWord = testNumbers[number]
      test.assert(errorText.includes(watchWord), `declined: ${watchWord}`)
    }
    test.end()
    done()
  }, 8080)
})
