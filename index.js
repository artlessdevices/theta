// HTTP Server Request Handler

const Busboy = require('busboy')
const FormData = require('form-data')
const constants = require('./constants')
const cookie = require('cookie')
const crypto = require('crypto')
const csrf = require('./csrf')
const doNotCache = require('do-not-cache')
const escapeHTML = require('escape-html')
const expired = require('./expired')
const fs = require('fs')
const gravatar = require('gravatar')
const html = require('./html')
const https = require('https')
const mail = require('./mail')
const notify = require('./notify')
const parseJSON = require('json-parse-errback')
const parseURL = require('url-parse')
const passwordStorage = require('./password-storage')
const path = require('path')
const querystring = require('querystring')
const runParallel = require('run-parallel')
const runSeries = require('run-series')
const simpleConcatLimit = require('simple-concat-limit')
const storage = require('./storage')
const uuid = require('uuid')

const environment = require('./environment')()
const stripe = require('stripe')(environment.STRIPE_SECRET_KEY)

const routes = require('http-hash')()
routes.set('/', serveIndex)
routes.set('/signup', serveSignUp)
routes.set('/login', serveLogIn)
routes.set('/logout', serveLogOut)
routes.set('/create', serveCreate)
routes.set('/account', serveAccount)
routes.set('/handle', serveHandle)
routes.set('/email', serveEMail)
routes.set('/password', servePassword)
routes.set('/reset', serveReset)
routes.set('/confirm', serveConfirm)
routes.set('/connected', serveConnected)
routes.set('/disconnect', serveDisconnect)

const handles = (() => {
  const pattern = '[a-z0-9]{3,16}'
  const re = new RegExp(`^${pattern}$`)
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

const projects = (() => {
  const pattern = '[a-z0-9]{3,16}'
  const re = new RegExp(`^${pattern}$`)
  return {
    pattern,
    valid: (string) => re.test(string),
    html: 'Project names must be ' +
      'made of the characters ‘a’ through ‘z’ ' +
      'and the digits ‘0’ through ‘9’. ' +
      'They must be at least three characters long, ' +
      'but no more than sixteen.'
  }
})()

const userPagePathRE = new RegExp(`^/~(${handles.pattern})$`)
const projectPagePathRE = new RegExp(`^/~(${handles.pattern})/(${projects.pattern})$`)

const userBadges = [
  {
    key: 'award',
    display: 'Award',
    title: `This user has done special service to ${constants.website}.`,
    icon: 'award'
  },
  {
    key: 'verified',
    display: 'Verified',
    title: `${constants.website} has verified this user.`,
    icon: 'check-circle'
  },
  {
    key: 'vanguard',
    display: 'Vanguard',
    title: `This user was one of the first to sign up for ${constants.website}.`,
    icon: 'angle-double-up'
  }
]

const projectBadges = [
  {
    key: 'featured',
    display: 'Features',
    title: `This project has been featured on ${constants.website}.`,
    icon: 'bullhorn'
  },
  {
    key: 'seedling',
    display: 'Seedling',
    title: `This project pays the miminum to ${constants.website} for each sale.`,
    icon: 'seedling'
  }
]

const hostLogos = [
  { icon: 'twitter', hostname: 'twitter.com' },
  { icon: 'github', hostname: 'github.com' },
  { icon: 'gitlab', hostname: 'gitlab.com' }
]

const icons = []
  .concat(userBadges.map(badge => badge.icon))
  .concat(projectBadges.map(badge => badge.icon))
  .concat(hostLogos.map(host => host.icon))

module.exports = (request, response) => {
  const parsed = request.parsed = parseURL(request.url, true)
  const pathname = parsed.pathname
  const { handler, params } = routes.get(pathname)
  if (handler) {
    request.parameters = params
    return authenticate(request, response, () => {
      handler(request, response)
    })
  }
  if (pathname === '/styles.css') return serveStyles(request, response)
  for (let index = 0; index < icons.length; index++) {
    const icon = icons[index]
    if (pathname === `/${icon}.svg`) {
      return serveIcon(request, response, icon)
    }
  }
  if (pathname === '/stripe-webhook') return serveStripeWebhook(request, response)
  if (pathname === '/internal-error' && !environment.production) {
    return serve500(request, response, new Error('test error'))
  }
  if (pathname === '/badges' && !environment.production) {
    return serveBadges(request, response)
  }
  let match = userPagePathRE.exec(pathname)
  if (match) {
    request.parameters = {
      handle: match[1]
    }
    return authenticate(request, response, () => {
      serveUserPage(request, response)
    })
  }
  match = projectPagePathRE.exec(pathname)
  if (match) {
    request.parameters = {
      handle: match[1],
      project: match[2]
    }
    return authenticate(request, response, () => {
      serveProjectPage(request, response)
    })
  }
  serve404(request, response)
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

function serveIcon (request, response, icon) {
  const file = path.join(__dirname, 'icons', `${icon}.svg`)
  response.setHeader('Content-Type', 'image/svg+xml')
  fs.createReadStream(file).pipe(response)
}

// https://html.spec.whatwg.org/multipage/input.html#valid-e-mail-address
const EMAIL_RE = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/

const UUID_RE = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/

const passwords = (() => {
  const min = 8
  const max = 64
  const pattern = exports.pattern = `.{${min},${max}}`
  const re = new RegExp(`^${pattern}$`)
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
                name: null,
                location: null,
                urls: [],
                badges: {},
                projects: [],
                created: new Date().toISOString(),
                confirmed: false,
                failures: 0,
                stripe: {
                  connected: false,
                  connectNonce: randomNonce()
                },
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
          action: 'confirm e-mail',
          created: new Date().toISOString(),
          handle,
          email
        }, error => {
          if (error) return done(error)
          request.log.info('recorded token')
          notify.confirmEMail({
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
              pattern="^${handles.pattern}$"
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

function randomNonce () {
  return crypto.randomBytes(32).toString('hex')
}

function serveCreate (request, response) {
  const title = 'Create Project'

  const fields = {
    project: {
      filter: e => e.toLowerCase().trim(),
      validate: projects.valid
    }
  }

  formRoute({
    action: '/create',
    requireAuthentication: true,
    form,
    fields,
    processBody,
    onSuccess
  })(request, response)

  function processBody (request, body, done) {
    const handle = request.account.handle
    const { project } = body
    const slug = `${handle}/${project}`
    const created = new Date().toISOString()
    runSeries([
      done => {
        storage.project.exists(slug, (error, exists) => {
          if (error) return done(error)
          if (exists) {
            const error = new Error('project nmame taken')
            error.statusCode = 400
            return done(error)
          }
          done()
        })
      },
      done => storage.project.write(slug, {
        project,
        handle,
        badges: {},
        created
      }, done),
      done => storage.account.update(handle, (data, done) => {
        data.projects.push({ project, created })
        done()
      }, done)
    ], done)
  }

  function onSuccess (request, response, body) {
    const slug = `${request.account.handle}/${body.project}`
    serve303(request, response, `/~${slug}`)
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
      <form id=createForm method=post>
        ${data.error}
        ${data.csrf}
        ${data.project.error}
        <p>
          <label for=project>Project Name</label>
          <input
              name=project
              type=text
              pattern="^${projects.pattern}$"
              value="${escapeHTML(data.project.value)}"
              autofocus
              required>
        </p>
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
          <th>Signed Up</th>
          <td class=signedup>${escape(new Date(account.created).toISOString())}</td>
        </tr>
        <tr>
          <th>Stripe</th>
          <td>${
            account.stripe.connected
              ? disconnectLink()
              : connectLink()
          }</td>
        </tr>
      </table>
      <a class=button href=/create>Create Project</a>
      <a class=button href=/password>Change Password</a>
      <a class=button href=/email>Change E-Mail</a>
    </main>
  </body>
</html>
  `)

  function disconnectLink () {
    const action = '/disconnect'
    const csrfInputs = csrf.inputs({
      action, sessionID: request.session.id
    })
    return html`
<form id=disconnectForm action=${action} method=post>
  ${csrfInputs}
  <button id=disconnect type=submit>Disconnect Stripe Account</button>
</form>
    `
  }

  function connectLink () {
    const url = 'https://connect.stripe.com/oauth/authorize?' +
      querystring.stringify({
        response_type: 'code',
        client_id: environment.STRIPE_CLIENT_ID,
        scope: 'read_write',
        state: account.stripe.connectNonce,
        redirect_uri: `${process.env.BASE_HREF}/connected`
      })
    return `<a id=connect class=button href="${url}">Connect Stripe Account</a>`
  }
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
      <h2>${title}</h2>
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
    <title>${title} / ${constants.website}</title>
  </head>
  <body>
    ${header}
    ${nav(request)}
    <main role=main>
      <h2>${title}</h2>
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
        action: 'change e-mail',
        created: new Date().toISOString(),
        handle,
        email
      }, error => {
        if (error) return done(error)
        request.log.info({ token }, 'e-mail change token')
        notify.changeEMail({
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
    if (
      tokenData.action !== 'reset password' ||
      expired.token(tokenData)
    ) {
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
        if (
          !tokenData ||
          tokenData.action !== 'reset password' ||
          expired.token(tokenData)
        ) {
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
              pattern="^${handles.pattern}$"
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
        action: 'reset password',
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
    if (!tokenData || expired.token(tokenData)) {
      return invalidToken(request, response)
    }
    storage.token.use(token, error => {
      if (error) return serve500(request, response, error)
      const action = tokenData.action
      if (action !== 'confirm e-mail' && action !== 'change e-mail') {
        response.statusCode = 400
        return response.end()
      }
      const handle = tokenData.handle
      if (action === 'confirm e-mail') {
        storage.account.confirm(handle, error => {
          if (error) return serve500(request, response, error)
          serve303(request, response, '/login')
        })
      }
      if (action === 'change e-mail') {
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

function serveConnected (request, response) {
  if (request.method !== 'GET') {
    response.statusCode = 405
    return response.end()
  }

  const query = request.parsed.query
  if (query.error) {
    const description = query.error_description
    request.log.info({
      error: query.error,
      description
    }, 'Stripe Connect error')
    return fail(description)
  }

  const account = request.account
  const { scope, code, state } = query
  request.log.info({ scope, code, state }, 'Stripe redirect')
  if (scope === 'read_write' && code && state) {
    if (account.stripe.connected) {
      request.log.warn('Stripe already connected')
      return fail('already connected')
    }
    if (state !== account.stripe.connectNonce) {
      request.log.warn({ state }, 'Connect nonce mismatch')
      return fail('Stripe Connect security failure')
    }
    let token
    return runSeries([
      done => {
        var form = new FormData()
        form.append('grant_type', 'authorization_code')
        form.append('code', code)
        form.append('client_secret', environment.STRIPE_SECRET_KEY)
        form.pipe(
          https.request({
            method: 'POST',
            host: 'connect.stripe.com',
            path: '/oauth/token',
            headers: form.getHeaders()
          })
            .once('error', done)
            .once('response', function (response) {
              simpleConcatLimit(response, 1024, (error, buffer) => {
                if (error) return done(error)
                parseJSON(buffer, (error, parsed) => {
                  if (error) return done(error)
                  token = parsed
                  request.log.info(token, 'Stripe token')
                  done()
                })
              })
            })
        )
      },
      done => storage.account.update(account.handle, {
        stripe: { connected: true, token }
      }, done),
      done => storage.stripeID.write(token.stripe_user_id, {
        handle: account.handle,
        date: new Date().toISOString()
      }, done),
      done => notify.connectedStripe({ to: account.email }, error => {
        // Log the error, but don't fail.
        if (error) request.log.error(error, 'E-Mail Error')
        done()
      })
    ], (error) => {
      if (error) {
        request.log.info(error, 'Connect error')
        return fail(error)
      }
      response.statusCode = 303
      response.setHeader('Location', '/account')
      response.end()
    })
  }

  response.statusCode = 400
  response.end()

  function fail (message) {
    response.statusCode = 500
    response.setHeader('Content-Type', 'text/html')
    return response.end(`
<!doctype html>
<html lang=en-US>
  <head>
    ${meta}
    <title>Stripe Error / ${constants.website}</title>
  </head>
  <body>
    ${header}
    ${nav(request)}
    <main role=main>
      <h2>Problem Connecting Stripe</h2>
      <p>Stripe reported an error connecting your account:</p>
      <blockqute><p>${escapeHTML(message)}</p></blockqute>
    </main>
  </body>
</html>
    `)
  }
}

function serveDisconnect (request, response) {
  if (request.method !== 'POST') return serve405(request, response)

  const account = request.account
  if (!account) return serve302(request, response, '/login')

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
    runSeries([
      done => csrf.verify({
        action: '/disconnect',
        sessionID: request.session.id,
        token: body.csrftoken,
        nonce: body.csrfnonce
      }, done),
      done => stripe.oauth.deauthorize({
        client_id: environment.STRIPE_CLIENT_ID,
        stripe_user_id: account.stripe.token.stripe_user_id
      }, done)
    ], error => {
      if (error) {
        request.log.error(error)
        response.statusCode = 500
        return response.end()
      }
      response.setHeader('Content-Type', 'text/html')
      response.end(html`
<!doctype html>
<html lang=en-US>
  <head>
    ${meta}
    <title>Disconnected Stripe Account / ${constants.website}</title>
  </head>
  <body>
    ${header}
    ${nav(request)}
    <main>
      <h2>Disconnected Stripe Account</h2>
      <p class=message>Stripe has been told to disconnect your account. The change should take effect shortly.</p>
    </main>
  </body>
</html>
      `)
    })
  }
}

const fontAwesomeCredit = `
<p>
  Icons by <a href=https://fontawesome.com>Font Awesome</a>
  under <a href=https://creativecommons.org/licenses/by/4.0/>CC-BY-4.0</a>.
</p>
`

function serveUserPage (request, response) {
  const { handle } = request.parameters

  runParallel({
    account: done => storage.account.read(handle, (error, account) => {
      if (error) return done(error)
      if (!account) {
        var notFound = new Error('not found')
        notFound.statusCode = 404
        return done(error)
      }
      done(null, redactedAccount(account))
    })
  }, (error, data) => {
    if (error) {
      if (error.statusCode === 404) return serve404(request, response)
      return serve500(request, response, error)
    }
    serveView(request, response, data.account, data => html`
<!doctype html>
<html lang=en-US>
  <head>
    ${meta}
    <title>${data.handle} / ${constants.website}</title>
  </head>
  <body>
    ${header}
    ${nav(request)}
    <main>
      <img
          class=avatar
          src="${gravatar.url(data.email, { size: 200, protocol: 'https' })}">
      <h2>${data.handle}</h2>
      <ul class=badges>${
        userBadges
          .filter(badge => data.badges[badge.key])
          .map(badge => `<li>${badgeImage(badge)}</li>`)
      }</ul>
      <table>
        ${data.name && row('Name', data.name)}
        ${data.location && row('Location', data.location)}
        ${data.urls.length > 0 && html`
        <tr>
          <th>URLs</th>
          <td><ul>${data.urls.map(urlLink)}</ul></td>
        </tr>`}
        <tr>
          <th>Joined</th>
          <td>${data.created}</td>
        </tr>
      </table>
      <h3>Projects</h3>
      <ul class=projects>
        ${data.projects.map(element => html`
        <li>
          <a href=/~${handle}/${element.project}>${element.project}</a>
        </li>
        `)}
      </ul>
    </main>
    <footer role=contentinfo>
      ${fontAwesomeCredit}
    </footer>
  </body>
</html>
    `)
  })
}

function redactedAccount (account) {
  const returned = redacted(account, [
    'badges',
    'created',
    'email',
    'handle',
    'location',
    'name',
    'projects',
    'urls'
  ])
  returned.stripe = { connected: account.stripe.connected }
  return returned
}

function redacted (object, publishable) {
  const clone = JSON.parse(JSON.stringify(object))
  Object.keys(clone).forEach(key => {
    if (!publishable.includes(key)) delete clone[key]
  })
  return clone
}

function row (label, string) {
  return html`
<tr>
  <th>${escapeHTML(label)}</th>
  <td>${escapeHTML(string)}</td>
</tr>
  `
}

function serveView (request, response, data, view) {
  const accept = request.headers.accept
  if (accept === 'application/json') {
    response.setHeader('Content-Type', 'application/json')
    return response.end(JSON.stringify(data))
  }
  response.setHeader('Content-Type', 'text/html')
  response.end(view(data))
}

function urlLink (url) {
  const escaped = escapeHTML(url)
  const shortened = escapeHTML(url.replace(/^https?:\/\//, ''))
  const parsed = parseURL(url)
  const logo = hostLogos.find(host => parsed.hostname === host.hostname)
  return html`
<a href="${escaped}" target=_blank>${
  logo && `<img class=logo alt=logo src=/${logo.icon}.svg>`
}${shortened}</a>
  `
}

function badgeImage ({ key, display, title, icon }) {
  return html`
<img
    class=badge
    alt="${key}"
    title="${escapeHTML(title)}"
    src="/${icon}.svg">
  `
}

function serveBadges (request, response) {
  response.setHeader('Content-Type', 'text/html')
  response.end(html`
<!doctype html>
<html lang=en-US>
  <head>
    ${meta}
    <title>Badges</title>
  </head>
  <body>
    ${header}
    ${nav(request)}
    <main>
      <h2>User Badges</h2>
      <ul class=badges>${
        userBadges.map(badge => `<li>${badgeImage(badge)}</li>`)
      }</ul>
      <h2>Project Badges</h2>
      <ul class=badges>${
        projectBadges.map(badge => `<li>${badgeImage(badge)}</li>`)
      }</ul>
      <h2>Host Logos</h2>
      ${urlLink('https://github.com/artlessdevices')}
      ${urlLink('https://gitlab.com/kemitchell')}
      ${urlLink('https://twitter.com/licensezero')}
    </main>
    <footer role=contentinfo>
      <p>
        Icons by <a href=https://fontawesome.com>Font Awesome</a>
        under <a href=https://creativecommons.org/licenses/by/4.0/>CC-BY-4.0</a>.
      </p>
    </footer>
  </body>
</html>
  `)
}

function serveProjectPage (request, response) {
  const { handle, project } = request.parameters
  const slug = `${handle}/${project}`

  runParallel({
    account: read(storage.account.read, handle, 'account'),
    project: read(storage.project.read, slug, 'project')
  }, (error, data) => {
    if (error) {
      if (error.statusCode === 404) return serve404(request, response)
      return serve500(request, response, error)
    }
    const project = redactedProject(data.project)
    project.account = redactedAccount(data.account)
    project.slug = slug
    serveView(request, response, project, data => html`
<!doctype html>
<html lang=en-US>
  <head>
    ${meta}
    <title>${data.slug} / ${constants.website}</title>
  </head>
  <body>
    ${header}
    ${nav(request)}
    <main>
      <h2>${data.project}</h2>
      <ul class=badges>${
        projectBadges
          .filter(badge => data.badges[badge.key])
          .map(badge => `<li>${badgeImage(badge)}</li>`)
      }</ul>
      <table>
        <tr>
          <th>User</th>
          <td><a href=/~${handle}>${handle}</a></td>
        </tr>
        <tr>
          <th>Created</th>
          <td>${data.created}</td>
        </tr>
        <tr>
          <th>Available</th>
          <td>${data.account.stripe.connected ? 'Yes' : 'No'}</td>
        </tr>
      </table>
    </main>
  </body>
</html>
    `)
  })

  function read (read, name, typeString) {
    return done => read(name, (error, data) => {
      if (error) return done(error)
      if (!data) {
        var notFound = new Error(`${typeString} not found`)
        notFound.statusCode = 404
        return done(error)
      }
      done(null, data)
    })
  }
}

function redactedProject (project) {
  return redacted(project, [
    'badges',
    'created',
    'project'
  ])
}

function serveStripeWebhook (request, response) {
  simpleConcatLimit(request, 2048, (error, buffer) => {
    if (error) return fail(error)

    let event
    try {
      event = stripe.webhooks.constructEvent(
        buffer.toString(),
        request.headers['stripe-signature'],
        process.env.STRIPE_WEBHOOK_SECRET
      )
    } catch (error) {
      request.log.warn(error)
      response.statusCode = 400
      return response.end()
    }

    request.log.info({ event }, 'Stripe webhook event')

    const type = event.type
    if (type === 'account.application.deauthorized') {
      const stripeID = event.account
      request.log.info({ stripeID }, 'Stripe ID')
      let handle
      return runSeries([
        done => storage.stripeID.read(stripeID, (error, record) => {
          if (error) return done(error)
          if (!record) return done(new Error('unknown Stripe account'))
          handle = record.handle
          done()
        }),
        done => storage.account.update(handle, {
          stripe: {
            connected: false,
            connectNonce: randomNonce()
          }
        }, done),
        done => storage.stripeID.delete(stripeID, done)
      ], error => {
        if (error) return fail(error)
        request.log.info({ handle }, 'Stripe disconnected')
        response.statusCode = 200
        response.end()
      })
    }

    response.statusCode = 400
    response.end()
  })

  function fail (error) {
    request.log.error(error)
    response.statusCode = 500
    return response.end()
  }
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
      pattern="^${passwords.pattern}$"
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
