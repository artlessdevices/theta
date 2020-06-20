const http = require('http')
const parse5 = require('parse5')
const server = require('./server')
const simpleConcat = require('simple-concat')
const tape = require('tape')

tape('homepage', test => {
  server((port, close) => {
    http.request({ port })
      .once('response', response => {
        simpleConcat(response, (error, buffer) => {
          test.ifError(error, 'no concat error')
          const string = buffer.toString()
          test.doesNotThrow(() => parse5.parse(string), 'valid HTML5')
          test.end()
          close()
        })
      })
      .end()
  })
})
