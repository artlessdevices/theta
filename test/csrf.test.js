const csrf = require('../csrf')
const tape = require('tape')
const uuid = require('uuid')

tape('CSRF round trip', (test) => {
  process.env.CSRF_KEY = csrf.randomKey()
  const action = '/logout'
  const sessionID = uuid.v4()
  const { token, nonce } = csrf.generate({ action, sessionID })
  csrf.verify({ action, sessionID, token, nonce }, error => {
    test.ifError(error)
    test.end()
  })
})

tape('CSRF action mismatch', (test) => {
  process.env.CSRF_KEY = csrf.randomKey()
  const action = '/logout'
  const sessionID = uuid.v4()
  const { token, nonce } = csrf.generate({ action, sessionID })
  csrf.verify({ action: '/login', sessionID, token, nonce }, error => {
    test.assert(error, 'error')
    test.equal(error.field, 'action', 'action')
    test.end()
  })
})

tape('CSRF session mismatch', (test) => {
  process.env.CSRF_KEY = csrf.randomKey()
  const action = '/logout'
  const sessionID = uuid.v4()
  const { token, nonce } = csrf.generate({ action, sessionID })
  csrf.verify({ action, sessionID: uuid.v4(), token, nonce }, error => {
    test.assert(error, 'error')
    test.equal(error.field, 'sessionID', 'sessionID')
    test.end()
  })
})
