const path = require('path')
const spawn = require('child_process').spawn

module.exports = function (source, callback) {
  const basename = path.basename(source, '.docx')
  const target = path.join(path.dirname(source), basename + '.pdf')
  spawn(
    'pandoc', ['-o', target, source]
  )
    .once('close', callback)
    .once('error', callback)
}
