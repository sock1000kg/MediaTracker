import { redactUrl } from '@/redactUrl.js'

describe('redactUrl', () => {
    it('redacts the password and keeps user/host/port/db', () => {
        const out = redactUrl('postgresql://user:s3cret@localhost:5434/mydb?schema=public')
        expect(out).not.toContain('s3cret')
        expect(out).toBe('postgresql://user:***@localhost:5434/mydb?schema=public')
    })
    it('leaves a URL without a password unchanged', () => {
        expect(redactUrl('postgresql://user@localhost:5432/mydb')).toBe('postgresql://user@localhost:5432/mydb')
        expect(redactUrl('redis://valkey:6379')).toBe('redis://valkey:6379')
    })
    it('handles empty input', () => {
        expect(redactUrl(undefined)).toBe('(unset)')
        expect(redactUrl(null)).toBe('(unset)')
        expect(redactUrl('')).toBe('(unset)')
        expect(redactUrl('   ')).toBe('(unset)')
    })
    it('does not throw on invalid input', () => {
        expect(redactUrl('not a url')).toBe('(invalid url)')
        expect(() => redactUrl('://@@')).not.toThrow()
    })
    it('handles special characters in the password', () => {
        const out = redactUrl('postgresql://u:p%40ss%2Fw%3Ard!x@h:5432/db')
        expect(out).not.toContain('p%40ss')
        expect(out).not.toContain('w%3Ard')
        expect(out).toBe('postgresql://u:***@h:5432/db')
        // a raw "@" in the password: the last "@" separates the host
        expect(redactUrl('postgresql://u:p@ss@h:5432/db')).toBe('postgresql://u:***@h:5432/db')
    })
    it('never echoes the password when the URL is unparseable', () => {
        expect(redactUrl('postgresql://u:pa#ss@:bad/db')).not.toContain('pa#ss')
    })
})
