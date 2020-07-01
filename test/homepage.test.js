const fs = require('fs')
const http = require('http')
const parse5 = require('parse5')
const path = require('path')
const server = require('./server')
const simpleConcat = require('simple-concat')
const tape = require('tape')

tape('homepage', test => {
  const handle = 'test'
  const project = 'test'
  server((port, close) => {
    const file = path.join(process.env.DIRECTORY, 'showcases', 'homepage.json')
    fs.mkdirSync(path.dirname(file))
    fs.writeFileSync(file, JSON.stringify([{ handle, project }]))
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
