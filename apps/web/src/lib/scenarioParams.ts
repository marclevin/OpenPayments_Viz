// Lets students tweak the parameters of an EXISTING scenario (amount, fixed-send/receive, currency,
// recurrence, split shares) without authoring a new one. The editor derives editable params from a
// scenario's spec and applies edits back into an "effective spec" that drives both the mock and the
// real runner. Currency edits are illustrative (mock display) — on TestNet the wallet decides.
import type { FlowExecutionSpec, SplitRecipient } from '@opviz/shared'

export type ScenarioParams = {
  amountMode: 'fixed-send' | 'fixed-receive'
  amountMajor: string // the fixed side's amount, in major units (string for the input)
  fixedAssetCode: string
  fixedAssetScale: number
  counterpartyAssetCode: string
  counterpartyAssetScale: number
  fxRate: string
  recurrenceCount: string // '' when the scenario isn't recurring
  recipients: { key: string; label: string; amountMajor: string }[] // [] when not a split
}

// Which controls the editor should show for a given scenario.
export type ParamCapabilities = {
  mode: boolean // fixed-send vs fixed-receive toggle (single-payment scenarios only)
  currency: boolean // illustrative currency + FX (mock display)
  recurrence: boolean // repeat count (subscription)
  split: boolean // per-recipient amounts (split payment)
}

function toMajor(value: string, scale: number): string {
  const n = Number(value)
  if (!Number.isFinite(n)) return ''
  return (n / 10 ** scale).toString()
}

function toMinor(major: string, scale: number): string {
  const n = Number(major)
  if (!Number.isFinite(n) || n < 0) return '0'
  return Math.round(n * 10 ** scale).toString()
}

// The repeat count from an ISO 8601 recurring interval template, e.g. "R12/<start>/P1M" -> "12".
function parseRecurrenceCount(interval?: string): string {
  if (!interval) return ''
  const m = /^R(\d+)\//.exec(interval)
  return m ? m[1]! : ''
}

export function paramCapabilities(spec: FlowExecutionSpec): ParamCapabilities {
  const split = Boolean(spec.recipients?.length)
  const recurrence = Boolean(spec.outgoingInterval)
  return {
    // Mode only makes sense for a single linear payment (not split, not recurring).
    mode: !split && !recurrence,
    currency: true,
    recurrence,
    split,
  }
}

export function deriveParams(spec: FlowExecutionSpec): ScenarioParams {
  const amountMode = spec.amountMode ?? 'fixed-receive'
  const fixed = (amountMode === 'fixed-send' ? spec.debitAmount : spec.incomingAmount) ?? spec.incomingAmount
  const fixedAssetCode = fixed?.assetCode ?? 'USD'
  const fixedAssetScale = fixed?.assetScale ?? 2
  const cp = spec.display?.counterpartyAsset ?? { assetCode: fixedAssetCode, assetScale: fixedAssetScale }

  return {
    amountMode,
    amountMajor: fixed ? toMajor(fixed.value, fixed.assetScale) : '',
    fixedAssetCode,
    fixedAssetScale,
    counterpartyAssetCode: cp.assetCode,
    counterpartyAssetScale: cp.assetScale,
    fxRate: (spec.display?.fxRate ?? 1).toString(),
    recurrenceCount: parseRecurrenceCount(spec.outgoingInterval),
    recipients: (spec.recipients ?? []).map((r) => ({
      key: r.key,
      label: r.label,
      amountMajor: toMajor(r.incomingAmount.value, r.incomingAmount.assetScale),
    })),
  }
}

// Build the effective spec from a base spec + the student's edits. Only the fields the runner and
// mock read are touched; step ids and structure are preserved from the base.
export function applyParams(spec: FlowExecutionSpec, params: ScenarioParams): FlowExecutionSpec {
  const next: FlowExecutionSpec = { ...spec }

  if (params.recipients.length && spec.recipients?.length) {
    // Split: recompute each recipient's incomingAmount; the customer total is their sum.
    const scale = params.fixedAssetScale
    const assetCode = params.fixedAssetCode
    const recipients: SplitRecipient[] = spec.recipients.map((r) => {
      const edited = params.recipients.find((p) => p.key === r.key)
      const value = toMinor(edited?.amountMajor ?? toMajor(r.incomingAmount.value, r.incomingAmount.assetScale), scale)
      return { ...r, incomingAmount: { value, assetCode, assetScale: scale } }
    })
    const total = recipients.reduce((sum, r) => sum + Number(r.incomingAmount.value), 0)
    next.recipients = recipients
    next.incomingAmount = { value: String(total), assetCode, assetScale: scale }
    return next
  }

  // Single payment: set the fixed side, clear the other, refresh the display FX hint.
  const amount = {
    value: toMinor(params.amountMajor, params.fixedAssetScale),
    assetCode: params.fixedAssetCode,
    assetScale: params.fixedAssetScale,
  }
  next.amountMode = params.amountMode
  if (params.amountMode === 'fixed-send') {
    next.debitAmount = amount
    next.incomingAmount = undefined
  } else {
    next.incomingAmount = amount
    next.debitAmount = undefined
  }
  next.display = {
    counterpartyAsset: { assetCode: params.counterpartyAssetCode, assetScale: params.counterpartyAssetScale },
    fxRate: Number(params.fxRate) || 1,
  }

  // Recurrence: swap the repeat count into the interval template, keeping start + period.
  if (spec.outgoingInterval && params.recurrenceCount) {
    const count = Math.max(1, Math.floor(Number(params.recurrenceCount) || 1))
    const parts = spec.outgoingInterval.split('/')
    if (parts.length === 3) {
      parts[0] = `R${count}`
      next.outgoingInterval = parts.join('/')
    }
  }

  return next
}

// The subset of an effective spec the runner needs (it ignores display; steps come from the base).
export type SpecOverrides = Pick<
  FlowExecutionSpec,
  'amountMode' | 'incomingAmount' | 'debitAmount' | 'outgoingInterval' | 'recipients'
>

export function toSpecOverrides(spec: FlowExecutionSpec): SpecOverrides {
  return {
    amountMode: spec.amountMode,
    incomingAmount: spec.incomingAmount,
    debitAmount: spec.debitAmount,
    outgoingInterval: spec.outgoingInterval,
    recipients: spec.recipients,
  }
}
