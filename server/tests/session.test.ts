import { describe, expect, it, vi } from 'vitest'

vi.stubEnv('JWT_SECRET', 'test-secret')
const { userFromCookieHeader } = await import('../auth/session')

describe('userFromCookieHeader', () => {
  it('treats malformed percent-encoding as logged out instead of throwing', () => {
    expect(userFromCookieHeader('stack.session=%E0%A4%A')).toBeUndefined()
    expect(userFromCookieHeader('a=b; stack.session=%')).toBeUndefined()
  })

  it('returns undefined without a cookie or with a bad token', () => {
    expect(userFromCookieHeader(undefined)).toBeUndefined()
    expect(userFromCookieHeader('stack.session=not-a-jwt')).toBeUndefined()
  })
})
