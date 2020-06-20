// Environment Variable Parsing and Validation

const variables = [
  {
    name: 'BASE_HREF',
    required: true
  },
  {
    name: 'CSRF_KEY',
    required: true
  },
  {
    name: 'DIRECTORY',
    required: true
  }
]

module.exports = () => {
  const returned = { missing: [] }
  variables.forEach(variable => {
    const name = variable.name
    const value = process.env[name]
    if (!value) returned.missing.push(name)
    else returned[name] = value
  })
  returned.production = process.env.NODE_ENV === 'production'
  return returned
}
