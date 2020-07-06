const assert = require('assert')
const constants = require('../constants')
const csrf = require('../csrf')
const fs = require('fs')
const handle = require('../')
const http = require('http')
const os = require('os')
const path = require('path')
const pino = require('pino')
const pinoHTTP = require('pino-http')
const rimraf = require('rimraf')
const spawn = require('child_process').spawn

module.exports = (callback, port) => {
  assert(typeof callback === 'function')
  port = port === undefined ? 0 : port
  const logger = pino({}, fs.createWriteStream('test-server.log'))
  const addLoggers = pinoHTTP({ logger })
  process.env.CSRF_KEY = csrf.randomKey()
  let directory
  let webServer
  let stripeCLI
  fs.mkdtemp(path.join(os.tmpdir(), constants.website.toLowerCase() + '-'), (error, tmp) => {
    if (error) {
      cleanup()
      throw error
    }
    directory = tmp
    process.env.DIRECTORY = tmp
    webServer = http.createServer((request, response) => {
      addLoggers(request, response)
      handle(request, response)
    })
    webServer.listen(port, function () {
      const port = this.address().port
      process.env.BASE_HREF = 'http://localhost:' + port
      process.env.ADMIN_EMAIL = 'admin@example.com'
      process.env.MINIMUM_COMMISSION = '5'
      const environment = require('../environment')()
      if (environment.missing.length !== 0) {
        cleanup()
        environment.missing.forEach(missing => {
          process.stderr.write(`Missing environment variable: ${missing}\n`)
        })
        assert(false)
      }
      const events = [
        'account.application.deauthorized',
        'payment_intent.succeeded',
        'payment_intent.payment_failed'
      ]
      stripeCLI = spawn(
        'stripe',
        [
          'listen',
          '--forward-to',
          `localhost:${port}/stripe-webhook`,
          '--events',
          events.join(',')
        ]
      )
      stripeCLI.stdout.once('data', () => {
        callback(port, cleanup)
      })
    })
  })

  function cleanup () {
    if (webServer) webServer.close()
    if (directory) rimraf(directory, () => {})
    if (stripeCLI) stripeCLI.kill()
  }
}
