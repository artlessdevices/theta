const constants = require('../constants')
const fs = require('fs')
const handle = require('../')
const http = require('http')
const os = require('os')
const path = require('path')
const pino = require('pino')
const pinoHTTP = require('pino-http')
const rimraf = require('rimraf')
const simpleConcat = require('simple-concat')
const tape = require('tape')

simple({
  path: '/',
  status: 200,
  mime: 'text/html',
  content: '<!doctype html>'
})

simple({
  path: '/styles.css',
  status: 200,
  mime: 'text/css; charset=UTF-8',
  content: 'font-family'
})

simple({
  path: '/nonexistent',
  status: 404,
  mime: 'text/html',
  content: '<!doctype html>'
})

simple({
  path: '/internal-error',
  status: 500,
  mime: 'text/html',
  content: '<!doctype html>'
})

simple({
  path: '/terms/service',
  status: 200,
  mime: 'text/html',
  content: 'Terms of Service'
})

simple({
  path: '/buy.js',
  status: 200,
  mime: 'application/javascript; charset=UTF-8',
  content: 'STRIPE_PUBLISHABLE_KEY'
})

simple({
  method: 'POST',
  path: '/',
  status: 405,
  mime: 'text/plain',
  content: 'Method Not Allowed'
})

simple({
  method: 'GET',
  path: '/github.svg',
  status: 200,
  mime: 'image/svg+xml'
})

simple({
  method: 'GET',
  path: '/award.svg',
  status: 200,
  mime: 'image/svg+xml'
})

function simple ({
  auth,
  method = 'GET',
  path,
  status,
  mime,
  content
}) {
  tape(`${method} ${path}`, test => {
    server((port, close) => {
      http.request({ auth, method, port, path })
        .once('response', response => {
          if (status) {
            test.equal(response.statusCode, status, String(status))
          }
          if (mime) {
            test.equal(response.headers['content-type'], mime, mime)
          }
          if (content) {
            return simpleConcat(response, (error, body) => {
              test.ifError(error, 'no error')
              test.assert(
                body.toString().includes(content),
                content
              )
              test.end()
              close()
            })
          }
          test.end()
          close()
        })
        .end()
    })
  })
}

function server (callback) {
  const logger = pino({}, fs.createWriteStream('test-server.log'))
  const server = http.createServer()
  const addLoggers = pinoHTTP({ logger })
  const tmpdir = path.join(os.tmpdir(), constants.website.toLowerCase() + '-test')
  fs.mkdtemp(tmpdir, (error, directory) => {
    if (error) throw error
    process.env.DIRECTORY = directory
    server.on('request', (request, response) => {
      addLoggers(request, response)
      handle(request, response)
    })
    server.listen(0, function () {
      const port = this.address().port
      callback(port, cleanup)
    })
    function cleanup () {
      server.close(() => {
        rimraf(directory, () => { })
      })
    }
  })
}
