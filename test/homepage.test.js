const http = require('http')
const parse5 = require('parse5')
const runSeries = require('run-series')
const server = require('./server')
const simpleConcat = require('simple-concat')
const storage = require('../storage')
const tape = require('tape')

tape('homepage', test => {
  const handle = 'test'
  const project = 'test'
  server((port, close) => {
    runSeries([
      done => storage.showcase.write('homepage', [
        { handle, project }
      ], done),
      done => storage.project.write(`${handle}/${project}`, {
        project,
        handle,
        urls: ['http://example.com'],
        price: 7,
        badges: {},
        category: 'library',
        created: new Date().toISOString()
      }, done)
    ], error => {
      test.ifError(error, 'no error')
      http.request({ port })
        .once('response', response => {
          simpleConcat(response, (error, buffer) => {
            test.ifError(error, 'no concat error')
            const string = buffer.toString()
            test.doesNotThrow(() => parse5.parse(string), 'valid HTML5')
            test.assert(
              string.includes(`<a href=/~${handle}/${project}`),
              'links to showcased'
            )
            test.end()
            close()
          })
        })
        .end()
    })
  })
})
