import type { AuditEntry, Purpose } from '@okolos/contracts'

import { findForbiddenContent, type RedactionFinding } from './redactor.js'
import { transport as defaultTransport, type TransportSpec } from './transport.js'

/** Closed set: the audit panel has human wording for each of these and no others. */
const PURPOSES: ReadonlySet<string> = new Set<Purpose>([
  'feed-update',
  'model-update',
  'password-range',
  'leak-lookup',
  'file-hash',
  'domain-status',
])

export interface RequestSpec {
  readonly url: string
  readonly method: 'GET' | 'POST'
  readonly purpose: Purpose
  /** How the payload is described to a human, e.g. 'hash-prefix:5BAA6'. */
  readonly payloadShape: string
  /** What caused this: 'alarm:feeds', 'user:password-check'. */
  readonly triggeredBy: string
  readonly body?: string
  readonly headers?: Readonly<Record<string, string>>
}

export interface RequestDeps {
  readonly writeAudit: (entry: AuditEntry) => Promise<void>
  readonly transport?: (spec: TransportSpec) => Promise<Response>
  readonly now: () => string
  readonly newId: () => string
}

export class RedactionError extends Error {
  constructor(readonly finding: RedactionFinding) {
    super(`Refused to send: ${finding.reason} found in the ${finding.where}`)
    this.name = 'RedactionError'
  }
}

export class AuditWriteError extends Error {
  constructor(cause: unknown) {
    super('Refused to send: the audit entry could not be written')
    this.name = 'AuditWriteError'
    this.cause = cause
  }
}

/**
 * The single egress point.
 *
 * Order is the whole design: the audit entry is written first, and a failure
 * to write it cancels the request. Written afterwards, the log would describe
 * what already happened; written first, it is the thing that permits it.
 */
export async function request(spec: RequestSpec, deps: RequestDeps): Promise<Response> {
  if (!PURPOSES.has(spec.purpose)) {
    throw new Error(`Refused to send: unknown purpose '${spec.purpose}'`)
  }

  // A malformed URL must be a refusal, not a crash: throwing out of `new URL`
  // here would skip the audit entry entirely, and an unlogged attempt is the
  // one thing this module exists to make impossible.
  let destination: string
  try {
    destination = new URL(spec.url).hostname
  } catch {
    throw new Error(`Refused to send: '${spec.url}' is not a valid URL`)
  }
  const entry = (outcome: AuditEntry['outcome']): AuditEntry => ({
    id: deps.newId(),
    createdAt: deps.now(),
    destination,
    purpose: spec.purpose,
    payloadShape: spec.payloadShape,
    triggeredBy: spec.triggeredBy,
    outcome,
  })

  const forbidden = findForbiddenContent(spec.url, spec.body)
  if (forbidden) {
    await deps.writeAudit(entry('blocked-by-redactor'))
    throw new RedactionError(forbidden)
  }

  try {
    await deps.writeAudit(entry('sent'))
  } catch (cause) {
    throw new AuditWriteError(cause)
  }

  const send = deps.transport ?? defaultTransport
  const transportSpec: TransportSpec = {
    url: spec.url,
    method: spec.method,
    ...(spec.body !== undefined ? { body: spec.body } : {}),
    ...(spec.headers !== undefined ? { headers: spec.headers } : {}),
  }

  try {
    return await send(transportSpec)
  } catch (cause) {
    await deps.writeAudit(entry('failed'))
    throw cause
  }
}
