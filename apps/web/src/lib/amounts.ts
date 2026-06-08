// The single source of truth for "what are the amounts/currencies of the current run", used by the
// templated scenario narrative, the quote-breakdown panel, and the wallet mismatch warning.
//
// This is a WEB-ONLY presentation concern: the runner already has the real values and emits them as
// events. For a live (TestNet) run we derive everything from the event stream; for a mock run we
// derive the currencies/amounts from the scenario spec + its illustrative `display` FX hint.
import type { FlowExecutionSpec, RunnerEvent } from '@opviz/shared'

export type Asset = { assetCode: string; assetScale: number }
export type Amount = { assetCode: string; assetScale: number; value: string }

// Open Payments amounts are integer minor units + an assetScale (e.g. 1234 @ scale 2 = 12.34).
// This module owns money formatting so it has no dependency on the narration layer.
export function fmtAmount(a?: { value: string; assetCode: string; assetScale: number }): string {
  if (!a) return ''
  const n = Number(a.value)
  if (!Number.isFinite(n)) return `${a.assetCode} ${a.value}`
  return `${a.assetCode} ${(n / 10 ** a.assetScale).toFixed(a.assetScale)}`
}

// Formats an amount, prefixing "≈" when this side is the FX-estimated (quote-derived) one. Single
// source of truth for the "≈" convention, reused by quote narration and the templated scenario prose.
export function approxAmount(
  side: 'debit' | 'receive',
  approxSide: 'debit' | 'receive' | undefined,
  a?: { value: string; assetCode: string; assetScale: number }
): string {
  if (!a) return ''
  const text = fmtAmount(a)
  return approxSide === side ? `≈ ${text}` : text
}

export type RunAmounts = {
  senderAsset: Asset // sending wallet currency
  receiverAsset: Asset // receiving wallet currency
  debitAmount?: Amount // what the sender pays — undefined until the quote exists
  receiveAmount?: Amount // what the receiver gets — undefined until the quote exists
  // Mock-only marker for the FX-estimated (quote-derived) side; undefined for exact/live amounts.
  approxSide?: 'debit' | 'receive'
  expiresAt?: string // quote expiry, if known
  // True once debit/receive amounts are populated (a quote has been created).
  resolved: boolean
}

// An asset code we couldn't determine yet (renders as a placeholder, never an empty string).
const UNKNOWN_ASSET: Asset = { assetCode: '', assetScale: 0 }

// Mock path: compute currencies + amounts from the spec and its `display` FX hint. This is the old
// `mockAmounts` from mockRun.ts, generalized to RunAmounts.
export function amountsFromSpec(spec: FlowExecutionSpec): RunAmounts {
  const fixedSend = spec.amountMode === 'fixed-send'
  const fixed = (fixedSend ? spec.debitAmount : spec.incomingAmount) ?? spec.incomingAmount

  // No fixed amount at all (shouldn't happen for runnable scenarios) — degrade gracefully.
  if (!fixed) {
    return { senderAsset: UNKNOWN_ASSET, receiverAsset: UNKNOWN_ASSET, resolved: false }
  }

  // Without display hints both sides share the fixed currency and nothing is approximate.
  const cpAsset = spec.display?.counterpartyAsset ?? { assetCode: fixed.assetCode, assetScale: fixed.assetScale }
  const fxRate = spec.display?.fxRate ?? 1
  const fixedMajor = Number(fixed.value) / 10 ** fixed.assetScale
  const counterparty: Amount = {
    assetCode: cpAsset.assetCode,
    assetScale: cpAsset.assetScale,
    value: Math.round(fixedMajor * fxRate * 10 ** cpAsset.assetScale).toString(),
  }

  const debitAmount = fixedSend ? fixed : counterparty
  const receiveAmount = fixedSend ? counterparty : fixed
  const approxSide: RunAmounts['approxSide'] = spec.display ? (fixedSend ? 'receive' : 'debit') : undefined

  return {
    senderAsset: { assetCode: debitAmount.assetCode, assetScale: debitAmount.assetScale },
    receiverAsset: { assetCode: receiveAmount.assetCode, assetScale: receiveAmount.assetScale },
    debitAmount,
    receiveAmount,
    approxSide,
    resolved: true,
  }
}

// Live path: derive everything from the accumulated events. Currencies come from
// walletAddress.resolved (via the `wallet` discriminant); amounts from the quote (exact, no ≈).
export function amountsFromEvents(events: RunnerEvent[]): RunAmounts {
  let senderAsset: Asset | undefined
  let receiverAsset: Asset | undefined
  let quote: Extract<RunnerEvent, { type: 'quote.created' }> | undefined

  for (const e of events) {
    if (e.type === 'walletAddress.resolved') {
      if (e.wallet === 'sending') senderAsset = { assetCode: e.assetCode, assetScale: e.assetScale }
      else if (e.wallet === 'receiving') receiverAsset = { assetCode: e.assetCode, assetScale: e.assetScale }
      // 'client' wallet plays no role in the amounts.
    } else if (e.type === 'quote.created') {
      quote = e // last one wins (split emits several; RunAmounts is single-payment by design)
    }
  }

  return {
    senderAsset: senderAsset ?? UNKNOWN_ASSET,
    receiverAsset: receiverAsset ?? UNKNOWN_ASSET,
    debitAmount: quote?.debitAmount,
    receiveAmount: quote?.receiveAmount,
    approxSide: quote?.approxSide,
    expiresAt: quote?.expiresAt,
    resolved: Boolean(quote?.debitAmount && quote?.receiveAmount),
  }
}

// Single entry point used by the app for both transports. For mock we seed from the spec (so the
// currencies are known immediately) then overlay whatever has actually streamed, giving the same
// progressive reveal as a live run. For sse we use events only — live wallet currencies must come
// from the wire, never from the spec's illustrative `display` data.
export function resolveRunAmounts(opts: {
  transport: 'mock' | 'sse'
  spec: FlowExecutionSpec
  events: RunnerEvent[]
}): RunAmounts {
  const { transport, spec, events } = opts
  if (transport === 'sse') return amountsFromEvents(events)

  const fromSpec = amountsFromSpec(spec)
  const fromEvents = amountsFromEvents(events)
  // A wallet-resolved event means the mock run has started streaming. Before that (idle), show the
  // scenario's canonical example figures so prose reads cleanly; once streaming, reveal
  // progressively — currencies first, amounts only after the quote event arrives.
  const started = events.some((e) => e.type === 'walletAddress.resolved')
  return {
    senderAsset: started ? fromEvents.senderAsset : fromSpec.senderAsset,
    receiverAsset: started ? fromEvents.receiverAsset : fromSpec.receiverAsset,
    debitAmount: fromEvents.resolved ? fromEvents.debitAmount : started ? undefined : fromSpec.debitAmount,
    receiveAmount: fromEvents.resolved ? fromEvents.receiveAmount : started ? undefined : fromSpec.receiveAmount,
    approxSide: fromSpec.approxSide,
    expiresAt: fromEvents.expiresAt,
    resolved: fromEvents.resolved || !started,
  }
}

// --- templated narrative ---------------------------------------------------

// Neutral placeholder for tokens whose amount isn't known yet (e.g. before the quote arrives).
const PLACEHOLDER = '—'

// Replaces {fixed} {debit} {receive} {senderAsset} {receiverAsset} tokens in scenario prose with the
// run's live figures. Amount tokens get a leading "≈" on the FX-estimated side (mock). Tokens whose
// value isn't known yet render as a neutral placeholder. Unknown tokens are left untouched.
export function renderTemplate(text: string | undefined, amounts: RunAmounts | undefined): string {
  if (!text) return text ?? ''
  if (!amounts) return text.replace(/\{(\w+)\}/g, PLACEHOLDER)

  const amt = (side: 'debit' | 'receive', a?: Amount) => (a ? approxAmount(side, amounts.approxSide, a) : PLACEHOLDER)
  const fixed =
    amounts.approxSide === 'receive'
      ? amt('debit', amounts.debitAmount)
      : amounts.approxSide === 'debit'
        ? amt('receive', amounts.receiveAmount)
        : amt('debit', amounts.debitAmount)

  const tokens: Record<string, string> = {
    senderAsset: amounts.senderAsset.assetCode || PLACEHOLDER,
    receiverAsset: amounts.receiverAsset.assetCode || PLACEHOLDER,
    debit: amt('debit', amounts.debitAmount),
    receive: amt('receive', amounts.receiveAmount),
    fixed,
  }
  return text.replace(/\{(\w+)\}/g, (m, key) => (key in tokens ? tokens[key] : m))
}
