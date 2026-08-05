import { describe, expect, it, vi } from 'vitest'

import { ClassifierSession, type Backend, type InferenceRuntime, type RuntimeSession } from './session.js'

const WEIGHTS = new Uint8Array([1, 2, 3]).buffer

function runtime(
  behaviour: Partial<Record<Backend, () => Promise<RuntimeSession>>> = {},
): InferenceRuntime & { created: Backend[] } {
  const created: Backend[] = []
  return {
    created,
    async create(_weights, backend) {
      created.push(backend)
      const make = behaviour[backend]
      if (make) return make()
      return { run: async () => 0.5 }
    },
  }
}

const unavailable = () => {
  throw new Error('backend not available')
}

describe('choosing a backend', () => {
  it('takes the fast one when the device has it', async () => {
    const rt = runtime()
    const session = await ClassifierSession.open(WEIGHTS, rt)
    expect(session.backend()).toBe('webgpu')
    expect(rt.created).toEqual(['webgpu'])
  })

  it('falls back rather than failing when the fast one is missing', async () => {
    // Most machines this ships to have no WebGPU. Falling back is the normal
    // path, not the exceptional one.
    const rt = runtime({ webgpu: unavailable })
    const session = await ClassifierSession.open(WEIGHTS, rt)
    expect(session.backend()).toBe('wasm')
    expect(rt.created).toEqual(['webgpu', 'wasm'])
  })

  it('reports the backend it actually got, never the one it wanted', async () => {
    const session = await ClassifierSession.open(WEIGHTS, runtime({ webgpu: unavailable }))
    expect(session.backend()).not.toBe('webgpu')
  })

  it('says what it tried when nothing works', async () => {
    const rt = runtime({ webgpu: unavailable, wasm: unavailable })
    await expect(ClassifierSession.open(WEIGHTS, rt)).rejects.toThrow(/webgpu.*wasm/i)
  })

  it('honours an explicit order, for a device where the default is wrong', async () => {
    const rt = runtime()
    await ClassifierSession.open(WEIGHTS, rt, ['wasm'])
    expect(rt.created).toEqual(['wasm'])
  })
})

describe('the session is built once', () => {
  it('is reused across scores rather than rebuilt per call', async () => {
    // Building a session is the expensive part. Doing it per candidate would
    // blow the 250 ms budget on the first page that has two of them.
    const rt = runtime()
    const session = await ClassifierSession.open(WEIGHTS, rt)
    await session.score('one')
    await session.score('two')
    expect(rt.created).toHaveLength(1)
  })

  it('refuses to score after it has been released', async () => {
    const session = await ClassifierSession.open(WEIGHTS, runtime())
    await session.close()
    await expect(session.score('anything')).rejects.toThrow(/closed/i)
  })

  it('releases the underlying session when it can', async () => {
    const release = vi.fn(async () => undefined)
    const rt = runtime({ webgpu: async () => ({ run: async () => 0.5, release }) })
    const session = await ClassifierSession.open(WEIGHTS, rt)
    await session.close()
    expect(release).toHaveBeenCalledTimes(1)
  })

  it('survives a runtime with nothing to release', async () => {
    const session = await ClassifierSession.open(WEIGHTS, runtime())
    await expect(session.close()).resolves.toBeUndefined()
  })
})

describe('what counts as a score', () => {
  it('passes a probability through unchanged', async () => {
    const rt = runtime({ webgpu: async () => ({ run: async () => 0.83 }) })
    const session = await ClassifierSession.open(WEIGHTS, rt)
    await expect(session.score('text')).resolves.toBeCloseTo(0.83)
  })

  it('refuses a number that is not a probability', async () => {
    // A broken score must not become evidence. Failing loudly here is what
    // keeps a numerical fault from turning into a verdict about someone's page.
    for (const bad of [Number.NaN, -0.1, 1.5, Number.POSITIVE_INFINITY]) {
      const rt = runtime({ webgpu: async () => ({ run: async () => bad }) })
      const session = await ClassifierSession.open(WEIGHTS, rt)
      await expect(session.score('text')).rejects.toThrow(/not a probability/i)
    }
  })

  it('lets a runtime failure surface rather than inventing a zero', async () => {
    const rt = runtime({
      webgpu: async () => ({
        run: async () => {
          throw new Error('inference crashed')
        },
      }),
    })
    const session = await ClassifierSession.open(WEIGHTS, rt)
    await expect(session.score('text')).rejects.toThrow('inference crashed')
  })
})
