// Two sites from one service: the companies site is picked by the request's Host (COMPANY_HOSTS),
// marked on the page, and its `/` is the companies landing.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loadConfig, parseHosts } from '../../src/server/config.ts'
import { markSite, siteForHost } from '../../src/server/lib/site.ts'
import { setSetting } from '../../src/server/services/settings.ts'
import { parseRoute, siteOf } from '../../src/web/site/logic.ts'
import { makeTestApp } from '../helpers/app.ts'

describe('COMPANY_HOSTS', () => {
  it('parses a comma list, lower case, without ports', () => {
    expect(parseHosts(undefined)).toEqual([])
    expect(parseHosts(' ')).toEqual([])
    expect(parseHosts('Teams.Example.co.il, b.example:443,,')).toEqual(['teams.example.co.il', 'b.example'])
    expect(loadConfig({ COMPANY_HOSTS: 'a.example' }).companyHosts).toEqual(['a.example'])
    expect(loadConfig({}).companyHosts).toEqual([])
  })

  it('picks the site by Host', () => {
    const hosts = ['teams.example.co.il']
    expect(siteForHost('teams.example.co.il', hosts)).toBe('companies')
    expect(siteForHost('TEAMS.example.co.il:8080', hosts)).toBe('companies')
    expect(siteForHost('example.co.il', hosts)).toBe('private')
    expect(siteForHost('teams.example.co.il.evil', hosts)).toBe('private')
    expect(siteForHost(undefined, hosts)).toBe('private')
    expect(siteForHost('teams.example.co.il', [])).toBe('private')
  })

  it('marks the companies page with the site and the private home', () => {
    const html = '<!doctype html>\n<html lang="he" dir="rtl">\n<head></head></html>'
    expect(markSite(html, 'private', 'https://x')).toBe(html)
    const marked = markSite(html, 'companies', 'https://example.co.il"><x')
    expect(marked).toContain(
      '<html data-site="companies" data-home="https://example.co.il&quot;>&lt;x" lang="he"',
    )
  })
})

describe('the site app', () => {
  it('reads the site from the page and routes / to the companies landing there', () => {
    const el = (d: Record<string, string>) => ({ dataset: d as DOMStringMap })
    expect(siteOf(el({}))).toEqual({ kind: 'private', privateHome: '/' })
    expect(siteOf(null)).toEqual({ kind: 'private', privateHome: '/' })
    expect(siteOf(el({ site: 'companies', home: 'https://example.co.il' }))).toEqual({
      kind: 'companies',
      privateHome: 'https://example.co.il',
    })
    expect(parseRoute('/', 'companies')).toEqual({ page: 'companies' })
    expect(parseRoute('/companies', 'companies')).toEqual({ page: 'companies' })
    expect(parseRoute('/order', 'companies')).toEqual({ page: 'build', stage: 'occasion', part: 1 })
    expect(parseRoute('/')).toEqual({ page: 'landing' })
    expect(parseRoute('/', 'private')).toEqual({ page: 'landing' })
  })
})

describe('the companies group size', () => {
  let t: Awaited<ReturnType<typeof makeTestApp>>
  beforeAll(async () => {
    t = await makeTestApp()
  })
  afterAll(() => t.close())

  it('comes from the settings, with defaults', async () => {
    expect((await t.app.inject({ url: '/api/shop' })).json().companyPeople).toEqual({ min: 10, max: 120 })
    await setSetting(t.db, 'company_min_people', 8)
    await setSetting(t.db, 'company_max_people', 200)
    expect((await t.app.inject({ url: '/api/shop' })).json().companyPeople).toEqual({ min: 8, max: 200 })
  })
})
