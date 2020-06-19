const spawn = require('child_process').spawn
const tape = require('tape')
const webdriverio = require('webdriverio')

// See: https://webdriver.io/docs/runprogrammatically.html

const driver = spawn('geckodriver')

let remote

module.exports = function () {
  if (!remote) {
    remote = webdriverio.remote({
      logLevel: 'error',
      path: '/',
      capabilities: { browserName: 'firefox' }
    })
  }
  return remote
}

tape.onFinish(kill)
process.on('SIGINT', kill)
process.on('SIGQUIT', kill)
process.on('SIGTERM', kill)
process.on('uncaughtException', error => {
  process.stderr.write(error.message)
  process.stderr.write(error.stack)
  process.exitCode = 1
  kill()
})

let killed = false
function kill () {
  if (killed) return
  killed = true
  if (remote) {
    remote
      .then(browser => browser.deleteSession())
      .then(() => driver.kill(9))
  } else {
    driver.kill(9)
  }
}
