const tape = require('tape')
const expired = require('../expired')

tape('expired unknown token', test => {
  const token = {
    action: 'invalid action',
    created: new Date().toISOString()
  }
  test.strictEqual(expired.token(token), false, 'returns false')
  test.end()
})
