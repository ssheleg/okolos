/**
 * Rendering the deploy config out of the checked-in template.
 *
 * Its own module so a test can reach it. The template in the repository keeps
 * `database_id = "set-at-deploy"` on purpose: the id belongs to one account,
 * and a repository that hard-codes it deploys into that account from anyone's
 * clone.
 */

/** Anything that is not a D1 uuid is a mistake worth catching before wrangler runs. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export const PLACEHOLDER = '"set-at-deploy"'

export function renderConfig(template, databaseId) {
  if (!UUID.test(databaseId)) {
    throw new Error(`database id is not a uuid: ${JSON.stringify(databaseId)}`)
  }
  if (!template.includes(PLACEHOLDER)) {
    throw new Error('template no longer carries the set-at-deploy placeholder')
  }
  const rendered = template.replace(PLACEHOLDER, JSON.stringify(databaseId))
  if (rendered.includes(PLACEHOLDER)) {
    throw new Error('placeholder survived the substitution')
  }
  return rendered
}
