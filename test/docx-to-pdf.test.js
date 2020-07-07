const constants = require('../constants')
const docxToPDF = require('../docx-to-pdf')
const fs = require('fs')
const os = require('os')
const path = require('path')
const rimraf = require('rimraf')
const tape = require('tape')

tape('DOCX to PDF', test => {
  fs.mkdtemp(path.join(os.tmpdir(), constants.website.toLowerCase() + '-'), (error, tmp) => {
    test.ifError(error, 'no mkdtemp error')
    const fixture = path.join(__dirname, 'test.docx')
    const docx = path.join(tmp, 'test.docx')
    const pdf = path.join(tmp, 'test.pdf')
    fs.copyFile(fixture, docx, error => {
      test.ifError(error, 'no copy error')
      docxToPDF(docx, error => {
        test.ifError(error, 'no convert error')
        fs.stat(pdf, (error, stats) => {
          test.ifError(error, 'no stat error')
          finish()
        })
      })
    })
    function finish () {
      rimraf(tmp, () => test.end())
    }
  })
})
