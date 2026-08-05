import { describe, expect, it, vi } from 'vitest'
import type { AuditEntry } from '@okolos/contracts'

import { ModelManager, type ModelDeps, type ModelDescriptor } from './manager.js'

const DESCRIPTOR: ModelDescriptor = {
  id: 'prompt-guard-22m',
  version: '1',
  url: 'https://models.example.test/prompt-guard-22m.onnx',
  sha256: 'a'.repeat(64),
  bytes: 24 * 1024 * 1024,
}

function deps(overrides: Partial<ModelDeps> = {}): ModelDeps & { audit: AuditEntry[] } {
  const audit: AuditEntry[] = []
  const bytes = new Uint8Array([1, 2, 3]).buffer
  const base: ModelDeps = {
    consent: async () => true,
    request: async () => new Response(bytes),
    digest: async () => DESCRIPTOR.sha256,
    cache: {
      read: async () => null,
      write: async () => undefined,
      clear: async () => undefined,
    },
    writeAudit: async (entry) => {
      audit.push(entry)
    },
    now: () => '2026-08-04T12:00:00.000Z',
    newId: () => 'a-1',
  }
  return { ...base, ...overrides, audit }
}

describe('a model is never fetched behind the user', () => {
  it('does not download without consent', async () => {
    const request = vi.fn()
    const manager = new ModelManager(DESCRIPTOR, deps({ consent: async () => false, request }))

    await expect(manager.ensure()).resolves.toBeNull()
    expect(request).not.toHaveBeenCalled()
  })

  it('records the refusal so the absence is visible, not silent', async () => {
    const d = deps({ consent: async () => false })
    const manager = new ModelManager(DESCRIPTOR, d)
    await manager.ensure()
    expect(d.audit).toEqual([])
    expect(manager.state()).toBe('declined')
  })

  it('downloads once consent is given, and logs it as a model update', async () => {
    const d = deps()
    const manager = new ModelManager(DESCRIPTOR, d)

    await expect(manager.ensure()).resolves.not.toBeNull()
    expect(d.audit).toHaveLength(1)
    expect(d.audit[0]).toMatchObject({ purpose: 'model-update', outcome: 'sent' })
    expect(d.audit[0]?.payloadShape).toContain('prompt-guard-22m')
  })
})

describe('what arrives is what was asked for', () => {
  it('rejects a payload whose digest does not match the pinned hash', async () => {
    const d = deps({ digest: async () => 'b'.repeat(64) })
    const manager = new ModelManager(DESCRIPTOR, d)

    await expect(manager.ensure()).rejects.toThrow(/digest/i)
    expect(manager.state()).toBe('failed')
  })

  it('does not cache a payload it rejected', async () => {
    const write = vi.fn()
    const d = deps({
      digest: async () => 'b'.repeat(64),
      cache: { read: async () => null, write, clear: async () => undefined },
    })
    await new ModelManager(DESCRIPTOR, d).ensure().catch(() => undefined)
    expect(write).not.toHaveBeenCalled()
  })

  it('records a failed download rather than swallowing it', async () => {
    const d = deps({
      request: async () => {
        throw new Error('offline')
      },
    })
    await expect(new ModelManager(DESCRIPTOR, d).ensure()).rejects.toThrow('offline')
    expect(d.audit.map((e) => e.outcome)).toContain('failed')
  })
})

describe('the second time costs nothing', () => {
  it('serves a cached model without touching the network', async () => {
    const request = vi.fn()
    const cached = new Uint8Array([9]).buffer
    const d = deps({ request, cache: { read: async () => cached, write: async () => undefined, clear: async () => undefined } })

    const manager = new ModelManager(DESCRIPTOR, d)
    await expect(manager.ensure()).resolves.toBe(cached)
    expect(request).not.toHaveBeenCalled()
    expect(d.audit).toEqual([])
  })

  it('discards a cached model when the pinned version moves', async () => {
    const clear = vi.fn()
    const d = deps({
      cache: { read: async () => null, write: async () => undefined, clear },
    })
    const manager = new ModelManager({ ...DESCRIPTOR, version: '2' }, d)
    await manager.ensure()
    expect(clear).toHaveBeenCalledWith('prompt-guard-22m')
  })
})

describe('state is legible from outside', () => {
  it('reports absent before anything happens', () => {
    expect(new ModelManager(DESCRIPTOR, deps()).state()).toBe('absent')
  })

  it('reports ready once the model is in hand', async () => {
    const manager = new ModelManager(DESCRIPTOR, deps())
    await manager.ensure()
    expect(manager.state()).toBe('ready')
  })
})
