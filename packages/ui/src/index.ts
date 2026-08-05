export {
  mountBanner,
  type BannerHandle,
  type BannerHandlers,
  type BannerProps,
  type BannerVariant,
} from './banner/banner.js'
export {
  mountInspector,
  type InspectorHandle,
  type InspectorHandlers,
  type InspectorProps,
} from './inspector/inspector.js'
export {
  renderExtensions,
  type ExtensionRow,
  type ExtensionsHandlers,
  type ExtensionsState,
} from './extensions/extensions.js'
export { renderQueue, type QueueHandlers } from './queue/queue.js'
export { renderLeaks, HIBP_ATTRIBUTION, type LeaksHandlers, type LeaksState } from './leaks/leaks.js'
export { renderRecovery, type RecoveryHandlers } from './recovery/recovery.js'
export {
  renderComparison,
  type ComparisonHandlers,
  type ComparisonProps,
} from './comparison/comparison.js'
export {
  renderInterstitial,
  type InterstitialHandlers,
  type InterstitialProps,
} from './interstitial/interstitial.js'
export {
  renderJournal,
  type JournalHandlers,
  type JournalMeta,
} from './journal/journal.js'
export {
  renderPopup,
  type PageVerdict,
  type PopupHandlers,
  type PopupState,
} from './popup/popup.js'
export { mountGate, type GateHandle, type GateHandlers, type GateProps } from './gate/gate.js'
export {
  renderFirstRun,
  type CheckRow,
  type CheckState,
  type FirstRunHandlers,
  type FirstRunProps,
} from './first-run/screen.js'
export { renderSelfAudit, type PanelHandlers, type PanelState } from './self-audit/panel.js'
export {
  renderDataControls,
  type DataControlsHandlers,
  type WipeOutcome,
} from './settings/data-controls.js'
export { shadowMode } from './shadow.js'
