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
  },
  {
    name: 'MINIMUM_COMMISSION',
    required: true
  },
  {
    name: 'STRIPE_CLIENT_ID',
    required: true
  },
  {
    name: 'STRIPE_SECRET_KEY',
    required: true
  },
  {
    name: 'STRIPE_PUBLISHABLE_KEY',
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
  returned.MINIMUM_COMMISSION = parseInt(returned.MINIMUM_COMMISSION)
  if (isNaN(returned.MINIMUM_COMMISSION)) {
    returned.missing.push('MINIMUM_COMMISSION')
  }
  returned.production = process.env.NODE_ENV === 'production'
  return returned
}
