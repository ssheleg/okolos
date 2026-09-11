export { parseMessage, parseAddressList, decodeEncodedWords, LIMITS } from './parse.js'
export { CHECKS, assembleVerdict, applyReview, worstOf } from './verdict.js'
export { buildReport } from './report.js'
export { checkReplyPath, checkSenderAuth, checkSenderIdentity } from './sender.js'
export type { IdentityDeps } from './sender.js'
export type {
  MailAddress,
  MailAttachment,
  MailMessage,
  ParseFailure,
  ParseOutcome,
} from './types.js'
export type {
  CheckId,
  CheckOutcome,
  MailFact,
  MailSignal,
  MailVerdict,
  NotRun,
  Review,
  ReviewerHome,
  Severity,
} from './verdict.js'
export type { ReportKind, ReportLine } from './report.js'
