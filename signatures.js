const assert = require('assert')
const sodium = require('sodium-native')

// Wrap an implementation of Ed25519 in our own API,
// which expects and returns hex-encoded strings.

module.exports = { keys, sign, verify }

function keys () {
  var publicKey = Buffer.alloc(32)
  var secretKey = Buffer.alloc(64)
  sodium.crypto_sign_keypair(publicKey, secretKey)
  return {
    privateKey: secretKey.toString('hex'),
    publicKey: publicKey.toString('hex')
  }
}

function sign (message, publicKey, privateKey) {
  assert(typeof publicKey === 'string')
  assert(typeof privateKey === 'string')
  var signature = Buffer.alloc(64)
  sodium.crypto_sign_detached(
    signature,
    Buffer.isBuffer(message)
      ? message
      : Buffer.from(message, 'utf8'),
    Buffer.from(privateKey, 'hex')
  )
  return signature.toString('hex')
}

function verify (message, signature, publicKey) {
  assert(typeof message === 'string')
  assert(typeof signature === 'string')
  assert(typeof privateKey === 'string')
  return sodium.crypto_sign_verify_detached(
    Buffer.from(signature, 'hex'),
    Buffer.from(message, 'utf8'),
    Buffer.from(publicKey, 'hex')
  )
}
