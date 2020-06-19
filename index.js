const Busboy = require('busboy')
const constants = require('./constants')
const cookie = require('cookie')
const csrf = require('./csrf')
const doNotCache = require('do-not-cache')
const escapeHTML = require('escape-html')
const fs = require('fs')
const html = require('./html')
const mail = require('./mail')
const notify = require('./notify')
const parseURL = require('url-parse')
const passwordStorage = require('./password-storage')
const path = require('path')
const runParallel = require('run-parallel')
const runSeries = require('run-series')
const storage = require('./storage')
const uuid = require('uuid')

const inProduction = process.env.NODE_ENV === 'production'

module.exports = (request, response) => {
  const parsed = request.parsed = parseURL(request.url, true)
  authenticate(request, response, () => {
    const pathname = parsed.pathname
    if (pathname === '/') return serveIndex(request, response)
    if (pathname === '/styles.css') return serveStyles(request, response)
    if (pathname === '/signup') return serveSignUp(request, response)
    if (pathname === '/login') return serveLogIn(request, response)
    if (pathname === '/logout') return serveLogOut(request, response)
    if (pathname === '/account') return serveAccount(request, response)
    if (pathname === '/handle') return serveHandle(request, response)
    if (pathname === '/email') return serveEMail(request, response)
    if (pathname === '/password') return servePassword(request, response)
    if (pathname === '/reset') return serveReset(request, response)
    if (pathname === '/confirm') return serveConfirm(request, response)
    if (pathname === '/internal-error' && !inProduction) {
      const testError = new Error('test error')
      return serve500(request, response, testError)
    }
    serve404(request, response)
  })
}

// Partials

const meta = html`
<meta charset=UTF-8>
<meta name=viewport content="width=device-width, initial-scale=1">
<link href=/styles.css rel=stylesheet>
`

const header = `<header role=banner><h1>${constants.website}</h1></header>`

function nav (request) {
  const account = request.account
  const handle = account && account.handle
  return html`
<nav role=navigation>
  ${!handle && '<a id=login class=button href=/login>Log In</a>'}
  ${!handle && '<a id=signup class=button href=/signup>Sign Up</a>'}
  ${handle && logoutButton(request)}
  ${handle && '<a id=account class=button href=/account>Account</a>'}
</nav>
  `
}

function logoutButton (request) {
  const csrfInputs = csrf.inputs({
    action: '/logout',
    sessionID: request.session.id
  })
  return html`
<form id=logoutForm action=/logout method=post>
  ${csrfInputs}
  <button id=logout type=submit>Log Out</button>
</form>
  `
}

// Routes

function serveIndex (request, response) {
  if (request.method !== 'GET') return serve405(request, response)
  doNotCache(response)
  response.setHeader('Content-Type', 'text/html')
  response.end(html`
<!doctype html>
<html lang=en-US>
  <head>
    ${meta}
    <title>${constants.website}</title>
  </head>
  <body>
    ${header}
    ${nav(request)}
    <main role=main></main>
  </body>
</html>
  `)
}

function serveStyles (request, response) {
  const file = path.join(__dirname, 'styles.css')
  response.setHeader('Content-Type', 'text/css')
  fs.createReadStream(file).pipe(response)
}

// https://html.spec.whatwg.org/multipage/input.html#valid-e-mail-address
const EMAIL_RE = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/

const UUID_RE = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/

const handles = (() => {
  const pattern = '^[a-z0-9]{3,16}$'
  const re = new RegExp(pattern)
  return {
    pattern,
    valid: (string) => re.test(string),
    html: 'Handles must be ' +
      'made of the characters ‘a’ through ‘z’ ' +
      'and the digits ‘0’ through ‘9’. ' +
      'They must be at least three characters long, ' +
      'but no more than sixteen.'
  }
})()

const passwords = (() => {
  const min = 8
  const max = 64
  const pattern = exports.pattern = `^.{${min},${max}}$`
  const re = new RegExp(pattern)
  return {
    pattern,
    valid: (string) => {
      if (!re.test(string)) return false
      const length = string.length
      return length >= min && length <= max
    },
    html: 'Passwords must be ' +
      `at least ${min} characters, ` +
      `and no more than ${max}.`
  }
})()

function serveSignUp (request, response) {
  const title = 'Sign Up'

  const fields = {
    email: {
      filter: e => e.toLowerCase().trim(),
      validate: e => EMAIL_RE.test(e)
    },
    handle: {
      filter: e => e.toLowerCase().trim(),
      validate: handles.valid
    },
    password: {
      validate: passwords.valid
    },
    repeat: {
      validate: (value, body) => value === body.password
    }
  }

  formRoute({
    action: '/signup',
    form,
    fields,
    processBody,
    onSuccess
  })(request, response)

  function processBody (request, body, done) {
    const { handle, email, password } = body
    runSeries([
      done => {
        storage.account.exists(handle, (error, exists) => {
          if (error) return done(error)
          if (exists) {
            const error = new Error('handle taken')
            error.statusCode = 400
            return done(error)
          }
          done()
        })
      },
      done => {
        storage.email.read(email, (error, handle) => {
          if (error) return done(error)
          if (!handle) return done()
          const hasAccount = new Error('e-mail address has an account')
          hasAccount.hasAccount = true
          hasAccount.statusCode = 401
          hasAccount.fieldName = 'email'
          done(hasAccount)
        })
      },
      done => {
        passwordStorage.hash(password, (error, passwordHash) => {
          if (error) return done(error)
          runSeries([
            done => {
              storage.account.write(handle, {
                handle,
                email,
                passwordHash,
                created: new Date().toISOString(),
                confirmed: false,
                failures: 0,
                locked: false
              }, done)
            },
            done => {
              storage.email.write(email, handle, done)
            }
          ], error => {
            if (error) return done(error)
            request.log.info('recorded account')
            done()
          })
        })
      },
      done => {
        const token = uuid.v4()
        storage.token.write(token, {
          action: 'confirm',
          created: new Date().toISOString(),
          handle,
          email
        }, error => {
          if (error) return done(error)
          request.log.info('recorded token')
          notify.confirmAccount({
            to: email,
            handle,
            url: `${process.env.BASE_HREF}/confirm?token=${token}`
          }, error => {
            if (error) return done(error)
            request.log.info('e-mailed token')
            done()
          })
        })
      },
      done => {
        if (!process.env.ADMIN_EMAIL) return done()
        mail({
          to: process.env.ADMIN_EMAIL,
          subject: 'Sign Up',
          text: `Handle: ${handle}\nE-Mail: ${email}\n`
        }, error => {
          if (error) request.log.error(error)
          done()
        })
      }
    ], done)
  }

  function onSuccess (request, response) {
    response.setHeader('Content-Type', 'text/html')
    response.end(html`
<!doctype html>
<html lang=en-US>
  <head>
    ${meta}
    <title>${title} / ${constants.website}</title>
  </head>
  <body>
    ${header}
    ${nav(request)}
    <main role=main>
      <h2>Success</h2>
      <p class=message>Check your e-mail for a link to confirm your new account.</p>
    </main>
  </body>
</html>
  `)
  }

  function form (request, data) {
    response.setHeader('Content-Type', 'text/html')
    response.end(html`
<!doctype html>
<html lang=en-US>
  <head>
    ${meta}
    <title>${title} / ${constants.website}</title>
  </head>
  <body>
    ${header}
    ${nav(request)}
    <main role=main>
      <h2>${title}</h2>
      <form id=signupForm method=post>
        ${data.error}
        ${data.csrf}
        ${eMailInput({
          autofocus: true,
          value: data.email.value
        })}
        ${data.email.error}
        <p>
          <label for=handle>Handle</label>
          <input
              name=handle
              type=text
              pattern="${handles.pattern}"
              value="${escapeHTML(data.handle.value)}"
              autofocus
              required>
        </p>
        ${data.handle.error}
        <p>${handles.html}</p>
        ${passwordInput({})}
        ${data.password.error}
        ${passwordRepeatInput()}
        ${data.repeat.error}
        <button type=submit>${title}</button>
      </form>
    </main>
  </body>
</html>
    `)
  }
}

function serveLogIn (request, response) {
  const title = 'Log In'

  const fields = {
    handle: {
      filter: (e) => e.toLowerCase().trim(),
      validate: x => x.length !== 0
    },
    password: {
      validate: x => x.length !== 0
    }
  }

  module.exports = formRoute({
    action: '/login',
    form,
    fields,
    processBody,
    onSuccess
  })(request, response)

  function form (request, data) {
    return html`
<!doctype html>
<html lang=en-US>
  <head>
    ${meta}
    <title>${title} / ${constants.website}</title>
  </head>
  <body>
    ${header}
    ${nav(request)}
    <main role=main>
      <h2>${title}</h2>
      <form id=loginForm method=post>
        ${data.error}
        ${data.csrf}
        <p>
          <label for=handle>Handle</label>
          <input name=handle type=text required autofocus>
        </p>
        ${data.handle.error}
        <p>
          <label for=password>Password</label>
          <input name=password type=password required>
        </p>
        ${data.password.error}
        <button type=submit>${title}</button>
      </form>
      <a href=/handle>Forgot Handle</a>
      <a href=/reset>Reset Password</a>
    </main>
  </body>
</html>
    `
  }

  function processBody (request, body, done) {
    const { handle, password } = body

    let sessionID
    runSeries([
      authenticate,
      createSession
    ], error => {
      if (error) return done(error)
      done(null, sessionID)
    })

    function authenticate (done) {
      passwordStorage.verify(handle, password, (verifyError, account) => {
        if (verifyError) {
          const statusCode = verifyError.statusCode
          if (statusCode === 500) return done(verifyError)
          if (!account) return done(verifyError)
          request.log.info(verifyError, 'authentication error')
          const failures = account.failures + 1
          if (failures >= 5) {
            return storage.account.update(handle, {
              locked: new Date().toISOString(),
              failures: 0
            }, recordError => {
              if (recordError) return done(recordError)
              done(verifyError)
            })
          }
          return storage.account.update(
            handle, { failures },
            (updateError) => {
              if (updateError) return done(updateError)
              done(verifyError)
            }
          )
        }
        request.log.info('verified credentials')
        done()
      })
    }

    function createSession (done) {
      sessionID = uuid.v4()
      storage.session.write(sessionID, {
        id: sessionID,
        handle,
        created: new Date().toISOString()
      }, (error, success) => {
        if (error) return done(error)
        if (!success) return done(new Error('session collision'))
        request.log.info({ id: sessionID }, 'recorded session')
        done()
      })
    }
  }

  function onSuccess (request, response, body, sessionID) {
    const expires = new Date(
      Date.now() + (30 * 24 * 60 * 60 * 1000) // thirty days
    )
    setCookie(response, sessionID, expires)
    request.log.info({ expires }, 'set cookie')
    serve303(request, response, '/')
  }
}

function serveLogOut (request, response) {
  if (request.method !== 'POST') {
    return serve405(request, response)
  }
  const body = {}
  const fields = ['csrftoken', 'csrfnonce']
  request.pipe(
    new Busboy({
      headers: request.headers,
      limits: {
        fieldNameSize: Math.max(fields.map(n => n.length)),
        fields: 2,
        parts: 1
      }
    })
      .on('field', function (name, value, truncated, encoding, mime) {
        if (fields.includes(name)) body[name] = value
      })
      .once('finish', onceParsed)
  )

  function onceParsed () {
    csrf.verify({
      action: '/logout',
      sessionID: request.session.id,
      token: body.csrftoken,
      nonce: body.csrfnonce
    }, error => {
      if (error) return redirect()
      clearCookie(response)
      redirect()
    })
  }

  function redirect () {
    response.statusCode = 303
    response.setHeader('Location', '/')
    response.end()
  }
}

function serveAccount (request, response) {
  if (request.method !== 'GET') return serve405(request, response)
  const account = request.account
  if (!account) return serve302(request, response, '/login')
  response.setHeader('Content-Type', 'text/html')
  response.end(html`
<!doctype html>
<html lang=en-US>
  <head>
    ${meta}
    <title>Account / ${constants.website}</title>
  </head>
  <body>
    ${header}
    ${nav(request)}
    <main role=main>
      <h2>Account</h2>
      <table>
        <tr>
          <th>Handle</th>
          <td class=handle>${escape(account.handle)}</td>
        </tr>
        <tr>
          <th>E-Mail</th>
          <td class=email>${escape(account.email)}</td>
        </tr>
        <tr>
          <th>signed Up</th>
          <td class=signedup>${escape(new Date(account.created).toISOString())}</td>
        </tr>
      </table>
      <a class=button href=/password>Change Password</a>
      <a class=button href=/email>Change E-Mail</a>
    </main>
  </body>
</html>
  `)
}

function serveHandle (request, response) {
  const title = 'Forgot Handle'

  const fields = {
    email: {
      filter: (e) => e.toLowerCase().trim(),
      validate: (e) => EMAIL_RE.test(e)
    }
  }

  formRoute({
    action: '/handle',
    form,
    fields,
    processBody,
    onSuccess
  })(request, response)

  function form (request, data) {
    return html`
<!doctype html>
<html lang=en-US>
  <head>
    ${meta}
    <title>${title} / ${constants.website}</title>
  </head>
  <body>
    ${header}
    ${nav(request)}
    <main role=main>
      <h2>Forgot Handle</h2>
      <form id=handleForm method=post>
        ${data.error}
        ${data.csrf}
        <p>
          <label for=email>E-Mail</label>
          <input
              name=email
              type=email
              required
              autofocus
              autocomplete=off>
        </p>
        ${data.email.error}
        <button type=submit>Send Handle</button>
      </form>
    </main>
  </body>
</html>
    `
  }

  function onSuccess (request, response, body) {
    response.setHeader('Content-Type', 'text/html')
    response.end(html`
<!doctype html>
<html lang=en-US>
  <head>
    ${meta}
    <title>Forgot Handle / ${constants.website}</title>
  </head>
  <body>
    ${header}
    ${nav(request)}
    <main role=main>
      <h2>Forgot Handle</h2>
      <p class=message>If the e-mail you entered corresponds to an account, an e-mail was just sent to it.</p>
    </main>
  </body>
</html>
    `)
  }

  function processBody (request, body, done) {
    const email = body.email
    storage.email.read(email, (error, handle) => {
      if (error) return done(error)
      if (!handle) return done()
      notify.handleReminder({
        to: email,
        handle
      }, done)
    })
  }
}

function serveEMail (request, response) {
  const title = 'Change E-Mail'

  const fields = {
    email: {
      filter: (e) => e.toLowerCase().trim(),
      validate: (e) => EMAIL_RE.test(e)
    }
  }

  formRoute({
    action: '/email',
    requireAuthentication: true,
    form,
    fields,
    processBody,
    onSuccess
  })(request, response)

  function form (request, data) {
    return html`
<!doctype html>
<html lang=en-US>
  <head>
    ${meta}
    <title>${title} / ${constants.website}</title>
  </head>
  <body>
    ${header}
    ${nav(request)}
    <main role=main>
      <h2>Change E-Mail</h2>
      <form id=emailForm method=post>
        ${data.error}
        ${data.csrf}
        ${eMailInput({ autofocus: true })}
        ${data.email.error}
        <button type=submit>${title}</button>
      </form>
    </main>
  </body>
</html>
    `
  }

  function onSuccess (request, response, body) {
    response.setHeader('Content-Type', 'text/html')
    response.end(html`
<!doctype html>
<html lang=en-US>
  <head>
    ${meta}
    <title>${title} / ${constants.website}</title>
  </head>
  <body>
    ${header}
    ${nav(request)}
    <main role=main>
      <h2>Change E-Mail</h2>
      <p class=message>Confirmation e-mail sent.</p>
    </main>
  </body>
</html>
    `)
  }

  function processBody (request, body, done) {
    const handle = request.account.handle
    const email = body.email
    storage.email.read(email, (error, existingHandle) => {
      if (error) return done(error)
      if (existingHandle) {
        const error = new Error('e-mail already has an account')
        error.fieldName = 'email'
        error.statusCode = 400
        return done(error)
      }
      const token = uuid.v4()
      storage.token.write(token, {
        action: 'email',
        created: new Date().toISOString(),
        handle,
        email
      }, error => {
        if (error) return done(error)
        request.log.info({ token }, 'e-mail change token')
        notify.confirmEMailChange({
          to: email,
          url: `${process.env.BASE_HREF}/confirm?token=${token}`
        }, done)
      })
    })
  }
}

function servePassword (request, response) {
  const method = request.method
  if (method === 'GET') return getPassword(request, response)
  if (method === 'POST') return postPassword(request, response)
  response.statusCode = 405
  response.end()
}

function getPassword (request, response) {
  if (request.parsed.query.token) return getWithToken(request, response)
  getAuthenticated(request, response)
}

function getAuthenticated (request, response) {
  const handle = request.account && request.account.handle
  if (!handle) {
    response.statusCode = 401
    response.end()
    return
  }
  const title = 'Change Password'
  const message = request.parsed.query.message
  const messageParagraph = message
    ? `<p class=message>${escapeHTML(message)}</p>`
    : ''
  response.setHeader('Content-Type', 'text/html')
  response.end(html`
<!doctype html>
<html lang=en-US>
  <head>
    ${meta}
    <title>${title} / ${constants.website}</title>
  </head>
  <body>
    ${header}
    ${nav(request)}
    <main role=main>
      <h2>${title}</h2>
      ${messageParagraph}
      <form id=passwordForm method=post>
        ${csrf.inputs({
          action: '/password',
          sessionID: request.session.id
        })}
        <p>
          <label for=old>Old Password</label>
          <input name=old type=password required autofocus autocomplete=off>
        </p>
        ${passwordInput({ label: 'New Password' })}
        ${passwordRepeatInput()}
        <button type=submit>${title}</button>
      </form>
    </main>
  </body>
</html>
  `)
}

function getWithToken (request, response) {
  const token = request.parsed.query.token
  if (!UUID_RE.test(token)) {
    return invalidToken(request, response)
  }
  storage.token.read(token, (error, tokenData) => {
    if (error) return serve500(request, response, error)
    if (!tokenData) return invalidToken(request, response)
    if (tokenData.action !== 'reset') {
      response.statusCode = 400
      return response.end()
    }
    const title = 'Change Password'
    const message = request.parsed.query.message || error
    const messageParagraph = message
      ? `<p class=message>${escapeHTML(message)}</p>`
      : ''
    response.setHeader('Content-Type', 'text/html')
    response.end(html`
<!doctype html>
<html lang=en-US>
  <head>
    ${meta}
    <title>${title} / ${constants.website}</title>
  </head>
  <body>
    ${header}
    ${nav(request)}
    <main role=main>
      <h2>${title}</h2>
      ${messageParagraph}
      <form id=passwordForm method=post>
        ${csrf.inputs({
          action: '/password',
          sessionID: request.session.id
        })}
        <input type=hidden name=token value="${token}">
        ${passwordInput({
          label: 'New Password',
          autofocus: true
        })}
        ${passwordRepeatInput()}
        <button type=submit>${title}</button>
      </form>
    </main>
  </body>
</html>
    `)
  })
}

function invalidToken (request, response) {
  const title = 'Change Password'
  response.statusCode = 400
  response.setHeader('Content-Type', 'text/html')
  return response.end(html`
<!doctype html>
<html lang=en-US>
  <head>
    ${meta}
    <title>${title} / ${constants.website}</title>
  </head>
  <body>
    ${header}
    ${nav(request)}
    <main role=main>
      <h2>${title}</h2>
      <p class=message>The link you followed is invalid or expired.</p>
    </main>
  </body>
</html>
  `)
}

function postPassword (request, response) {
  let handle
  const body = {}
  const fieldNames = [
    'password', 'repeat', 'token', 'old',
    'csrftoken', 'csrfnonce'
  ]
  runSeries([
    readPostBody,
    validateInputs,
    checkOldPassword,
    changePassword,
    sendEMail
  ], function (error) {
    if (error) {
      if (error.statusCode === 400) {
        response.statusCode = 400
        return getPassword(request, response, error.message)
      }
      request.log.error(error)
      response.statusCode = error.statusCode || 500
      return response.end()
    }
    const title = 'Change Password'
    response.setHeader('Content-Type', 'text/html')
    response.end(html`
<!doctype html>
<html lang=en-US>
  <head>
    ${meta}
    <title>${title} / ${constants.website}</title>
  </head>
  <body>
    ${header}
    ${nav(request)}
    <main role=main>
      <h2>${title}</h2>
      <p class=message>Password changed.</p>
    </main>
  </body>
</html>
    `)
  })

  function readPostBody (done) {
    request.pipe(
      new Busboy({
        headers: request.headers,
        limits: {
          fieldNameSize: Math.max(fieldNames.map(x => x.length)),
          fields: fieldNames.length,
          parts: 1
        }
      })
        .on('field', function (name, value, truncated, encoding, mime) {
          if (fieldNames.includes(name)) body[name] = value
        })
        .once('finish', done)
    )
  }

  function validateInputs (done) {
    let error
    const token = body.token
    if (token && !UUID_RE.test(token)) {
      error = new Error('invalid token')
      error.fieldName = 'token'
      return done(error)
    }
    const password = body.password
    const repeat = body.repeat
    if (password !== repeat) {
      error = new Error('passwords did not match')
      error.fieldName = 'repeat'
      return done(error)
    }
    if (!passwords.valid(password)) {
      error = new Error('invalid password')
      error.fieldName = 'password'
      return done(error)
    }
    const old = body.old
    if (!token && !old) {
      error = new Error('missing old password')
      error.fieldName = 'old'
      return done(error)
    }
    csrf.verify({
      action: '/password',
      sessionID: request.session.id,
      token: body.csrftoken,
      nonce: body.csrfnonce
    }, done)
  }

  function checkOldPassword (done) {
    const token = body.token
    if (token) return done()
    if (!request.account) {
      const unauthorized = new Error('unauthorized')
      unauthorized.statusCode = 401
      return done(unauthorized)
    }
    handle = request.account.handle
    passwordStorage.verify(handle, body.old, error => {
      if (error) {
        const invalidOldPassword = new Error('invalid password')
        invalidOldPassword.statusCode = 400
        return done(invalidOldPassword)
      }
      return done()
    })
  }

  function changePassword (done) {
    const token = body.token
    if (token) {
      return storage.token.read(token, (error, tokenData) => {
        if (error) return done(error)
        if (!tokenData || tokenData.action !== 'reset') {
          const failed = new Error('invalid token')
          failed.statusCode = 401
          return done(failed)
        }
        storage.token.use(token, error => {
          if (error) return done(error)
          handle = tokenData.handle
          recordChange()
        })
      })
    }

    recordChange()

    function recordChange () {
      passwordStorage.hash(body.password, (error, passwordHash) => {
        if (error) return done(error)
        storage.account.update(handle, { passwordHash }, done)
      })
    }
  }

  function sendEMail (done) {
    storage.account.read(handle, (error, account) => {
      if (error) return done(error)
      notify.passwordChanged({
        to: account.email,
        handle
      }, error => {
        // Log and eat errors.
        if (error) request.log.error(error)
        done()
      })
    })
  }
}

function serveReset (request, response) {
  const title = 'Reset Password'

  const fields = {
    handle: {
      validate: handles.valid
    }
  }

  formRoute({
    action: '/reset',
    form,
    fields,
    processBody,
    onSuccess
  })(request, response)

  function form (request, data) {
    return html`
<!doctype html>
<html lang=en-US>
  <head>
    ${meta}
    <title>${title} / ${constants.website}</title>
  </head>
  <body>
    ${header}
    ${nav(request)}
    <main role=main>
      <h2>${title}</h2>
      <form id=resetForm method=post>
        ${data.error}
        ${data.csrf}
        <p>
          <label for=handle>Handle</label>
          <input
              name=handle
              value="${escapeHTML(data.handle.value)}"
              type=text
              pattern="${escapeHTML(handles.pattern)}"
              required
              autofocus
              autocomplete=off>
        </p>
        ${data.handle.error}
        <button type=submit>Send E-Mail</button>
      </form>
    </main>
  </body>
</html>
    `
  }

  function processBody (request, body, done) {
    const handle = body.handle
    storage.account.read(handle, (error, account) => {
      if (error) return done(error)
      if (!account) {
        const invalid = new Error('invalid handle')
        invalid.statusCode = 400
        return done(invalid)
      }
      const token = uuid.v4()
      storage.token.write(token, {
        action: 'reset',
        created: new Date().toISOString(),
        handle
      }, error => {
        if (error) return done(error)
        const url = `${process.env.BASE_HREF}/password?token=${token}`
        notify.passwordReset({
          to: account.email,
          handle,
          url
        }, done)
      })
    })
  }

  function onSuccess (request, response) {
    response.setHeader('Content-Type', 'text/html')
    response.end(html`
<!doctype html>
<html lang=en-US>
  <head>
    ${meta}
    <title>${title} / ${constants.website}</title>
  </head>
  <body>
    ${header}
    <main role=main>
      <h2>Reset Password</h2>
      <p class=message>An e-mail has been sent.</p>
    </main>
  </body>
</html>
    `)
  }
}

function serveConfirm (request, response) {
  if (request.method !== 'GET') {
    return serve405(request, response)
  }

  const token = request.parsed.query.token
  if (!UUID_RE.test(token)) {
    return invalidToken(request, response)
  }

  storage.token.read(token, (error, tokenData) => {
    if (error) return serve500(request, response, error)
    if (!tokenData) return invalidToken(request, response)
    storage.token.use(token, error => {
      if (error) return serve500(request, response, error)
      const action = tokenData.action
      if (action !== 'confirm' && action !== 'email') {
        response.statusCode = 400
        return response.end()
      }
      const handle = tokenData.handle
      if (action === 'confirm') {
        storage.account.confirm(handle, error => {
          if (error) return serve500(request, response, error)
          serve303(request, response, '/login')
        })
      }
      if (action === 'email') {
        const email = tokenData.email
        let oldEMail
        runSeries([
          done => {
            storage.account.read(handle, (error, account) => {
              if (error) return done(error)
              oldEMail = account.email
              done()
            })
          },
          done => storage.account.update(handle, { email }, done),
          done => storage.email.delete(oldEMail, done),
          done => storage.email.write(email, handle, done)
        ], error => {
          if (error) return serve500(request, response, error)
          const title = 'E-Mail Change'
          response.setHeader('Content-Type', 'text/html')
          response.end(html`
<!doctype html>
<html lang=en-US>
  <head>
    ${meta}
    <title>${title} / ${constants.website}</title>
  </head>
  <body>
    ${header}
    ${nav(request)}
    <main role=main>
      <h2>${title}</h2>
      <p class=message>The e-mail address for your account was successfully changed.</p>
    </main>
  </body>
</html>
          `)
        })
      }
    })
  })
}

const cookieName = constants.website.toLowerCase()

function setCookie (response, value, expires) {
  response.setHeader(
    'Set-Cookie',
    cookie.serialize(cookieName, value, {
      expires,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV !== 'test'
    })
  )
}

function clearCookie (response) {
  setCookie(response, '', new Date('1970-01-01'))
}

function eMailInput ({ value, autofocus }) {
  return html`
<p>
  <label for=email>E-Mail</label>
  <input
      name=email
      type=email
      value="${escapeHTML(value || '')}"
      ${autofocus ? 'autofocus' : ''}
      required>
</p>
  `
}

function passwordInput ({ label, autofocus }) {
  return html`
<p>
  <label for=password>${escapeHTML(label || 'Password')}</label>
  <input
      name=password
      type=password
      required
      autocomplete=off
      ${autofocus ? 'autofocus' : ''}>
</p>
<p>${escapeHTML(passwords.html)}</p>
  `
}

function passwordRepeatInput () {
  return html`
<p>
  <label for=repeat>Repeat</label>
  <input
      name=repeat
      type=password
      pattern="${passwords.pattern}"
      required
      autocomplete=off>
</p>
  `
}

function formRoute ({
  action,
  requireAuthentication,
  loadGETData,
  form,
  fields,
  fieldSizeLimit = 512000,
  processBody,
  onPost,
  onSuccess
}) {
  if (typeof form !== 'function') {
    throw new TypeError('missing form function')
  }

  if (typeof processBody !== 'function') {
    throw new TypeError('missing processBody function')
  }

  if (typeof onSuccess !== 'function') {
    throw new TypeError('missing onSuccess function')
  }

  const fieldNames = Object.keys(fields)
  fieldNames.forEach(fieldName => {
    const description = fields[fieldName]
    if (typeof description.validate !== 'function') {
      throw new TypeError('missing validate function for ' + fieldName)
    }
    if (!description.displayName) {
      description.displayName = fieldName
    }
  })

  return (request, response) => {
    const method = request.method
    const isGet = method === 'GET'
    const isPost = !isGet && method === 'POST'
    if (!isGet && !isPost) return serve405(request, response)
    proceed()

    function proceed () {
      if (requireAuthentication && !request.account) {
        return serve303(request, response, '/login')
      }
      if (isGet) return get(request, response)
      post(request, response)
    }
  }

  function get (request, response, body, error) {
    response.setHeader('Content-Type', 'text/html')
    const data = {}
    if (body) {
      fieldNames.forEach(fieldName => {
        data[fieldName] = {
          value: body[fieldName],
          error: error && error.fieldName === fieldName
            ? `<p class=error>${escapeHTML(error.message)}</p>`
            : ''
        }
      })
    } else {
      fieldNames.forEach(fieldName => {
        data[fieldName] = { value: '', error: false }
      })
    }
    if (error && !error.fieldName) {
      data.error = `<p class=error>${escapeHTML(error.message)}</p>`
    }
    data.csrf = csrf.inputs({
      action,
      sessionID: request.session.id
    })
    if (loadGETData) {
      return loadGETData(request, data, error => {
        if (error) return serve500(request, response, error)
        response.end(form(request, data))
      })
    }
    response.end(form(request, data))
  }

  function post (request, response) {
    if (onPost) onPost(request, response)

    const body = {}
    let fromProcess
    runSeries([
      parse,
      validate,
      process
    ], error => {
      if (error) {
        const statusCode = error.statusCode
        if (statusCode >= 400 && statusCode < 500) {
          response.statusCode = statusCode
          return get(request, response, body, error)
        }
        return serve500(request, response, error)
      }
      onSuccess(request, response, body, fromProcess)
    })

    function parse (done) {
      request.pipe(
        new Busboy({
          headers: request.headers,
          limits: {
            fieldNameSize: Math.max(
              fieldNames
                .concat('csrftoken', 'csrfnonce')
                .map(n => n.length)
            ),
            fields: fieldNames.length + 2,
            fieldSizeLimit,
            parts: 1
          }
        })
          .on('field', function (name, value, truncated, encoding, mime) {
            if (name === 'csrftoken' || name === 'csrfnonce') {
              body[name] = value
              return
            }
            const description = fields[name]
            if (!description) return
            body[name] = description.filter
              ? description.filter(value)
              : value
          })
          .once('finish', done)
      )
    }

    function validate (done) {
      for (let index = 0; index < fieldNames.length; index++) {
        const fieldName = fieldNames[index]
        const description = fields[fieldName]
        const valid = description.validate(body[fieldName], body)
        if (valid) continue
        const error = new Error('invalid ' + description.displayName)
        error.statusCode = 401
        return done(error)
      }
      csrf.verify({
        action,
        sessionID: request.session.id,
        token: body.csrftoken,
        nonce: body.csrfnonce
      }, done)
    }

    function process (done) {
      processBody(request, body, (error, result) => {
        if (error) return done(error)
        fromProcess = result
        done()
      })
    }
  }
}

function serve404 (request, response) {
  response.statusCode = 404
  response.setHeader('Content-Type', 'text/html')
  response.end(`
<!doctype html>
<html lang=en-US>
  <head>
    ${meta}
    <title>Not Found / ${constants.website}</title>
  </head>
  <body>
    ${header}
    ${nav(request)}
    <main>
      <h2>Not Found</h2>
    </main>
  </body>
</html>
  `)
}

function serve500 (request, response, error) {
  request.log.error(error)
  response.statusCode = 500
  response.setHeader('Content-Type', 'text/html')
  response.end(html`
<!doctype html>
<html lang=en-US>
  <head>
    ${meta}
    <title>Internal Error / ${constants.website}</title>
  </head>
  <body>
    <main>
      <h1>Internal Error</h1>
    </main>
  </body>
</html>
  `)
}

function serve405 (request, response) {
  response.statusCode = 405
  response.setHeader('Content-Type', 'text/plain')
  response.end('Method Not Allowed')
}

function serve303 (request, response, location) {
  response.statusCode = 303
  response.setHeader('Location', location)
  response.end()
}

function serve302 (request, response, location) {
  response.statusCode = 302
  response.setHeader('Location', location)
  response.end()
}

function authenticate (request, response, handler) {
  const header = request.headers.cookie
  if (!header) {
    createGuestSession()
    return proceed()
  }
  const parsed = cookie.parse(header)
  const sessionID = parsed[cookieName]
  if (!sessionID) {
    createGuestSession()
    return proceed()
  }
  storage.session.read(sessionID, function (error, session) {
    /* istanbul ignore if */
    if (error) return serve500(request, response, error)
    if (!session) {
      request.session = { id: sessionID }
      return proceed()
    }
    const handle = session.handle
    request.log.info({ sessionID, handle }, 'authenticated')
    request.session = session
    runParallel({
      account: function (done) {
        storage.account.read(handle, done)
      }
    }, function (error, results) {
      /* istanbul ignore if */
      if (error) return serve500(request, response, error)
      const account = results.account
      if (!account) {
        const error = new Error('could not load account')
        return serve500(request, response, error)
      }
      if (account.confirmed) request.account = account
      proceed()
    })
  })

  function proceed () {
    handler(request, response)
  }

  function createGuestSession () {
    const id = uuid.v4()
    const expires = new Date(
      Date.now() + (30 * 24 * 60 * 60 * 1000)
    )
    setCookie(response, id, expires)
    request.session = { id, expires }
  }
}
