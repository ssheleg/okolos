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
