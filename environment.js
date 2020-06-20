// Environment Variable Parsing and Validation

const variables = [
  {
    name: 'BASE_HREF',
    required: true
  },
  {
    name: 'CSRF_KEY',
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
  return returned
}
