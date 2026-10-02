// Fails fast on settings that would make a production server unsafe. In development it only warns.
const prod = process.env.NODE_ENV === 'production'
const problems: string[] = []

const secret = process.env.JWT_SECRET ?? ''
if (!secret) problems.push('JWT_SECRET is not set')
else if (prod && (secret.length < 32 || /change-me/i.test(secret))) problems.push('JWT_SECRET must be a random string of at least 32 characters')

if (prod) {
  if (!process.env.DATABASE_URL) problems.push('DATABASE_URL is not set')
  if (!/^https:\/\//.test(process.env.CLIENT_ORIGIN ?? '')) problems.push('CLIENT_ORIGIN must be the public https:// origin of the site')
  if (process.env.TRUST_PROXY !== '1') console.warn('TRUST_PROXY is not 1: rate limits will see the proxy address instead of the visitor if you run behind one')
}

if (problems.length) {
  const message = `Unsafe configuration: ${problems.join('; ')}`
  if (prod) throw new Error(message)
  console.warn(message)
}
