const assert = require('assert')

module.exports = ({
  browser,
  port,
  project,
  url,
  price,
  category = 'library'
}, callback) => {
  assert(browser)
  assert(Number.isSafeInteger(port))
  assert(typeof project === 'string')
  assert(typeof url === 'string')
  assert(Number.isSafeInteger(price))
  assert(typeof category === 'string')
  return browser.navigateTo('http://localhost:' + port)
    .then(() => browser.$('=Account'))
    .then(account => account.click())
    .then(() => browser.$('=Create Project'))
    .then(create => create.click())
    .then(() => browser.$('#createForm input[name="project"]'))
    .then(input => input.addValue(project))
    .then(() => browser.$('#createForm input[name="url"]'))
    .then(input => input.addValue(url))
    .then(() => browser.$('#createForm input[name="price"]'))
    .then(input => input.addValue(price))
    .then(() => browser.$('#createForm select[name="category"]'))
    .then(input => input.selectByVisibleText(category))
    .then(() => browser.$('#createForm button[type="submit"]'))
    .then(submit => submit.click())
    .catch(callback)
}
