import { useState } from 'react'
import { approxAmount, fmtAmount, type RunAmounts } from '../lib/amounts'

// A collapsible summary of the current run's quote: what the sender pays, what the receiver gets, the
// implied FX rate, and when the quote expires. Collapsed by default (showing a one-line summary) so
// it doesn't dominate the narration panel. Open Payments quotes don't itemize fees, so the gap
// between the two amounts is FX + fees combined — labeled honestly.
export function QuoteBreakdown({ amounts }: { amounts: RunAmounts }) {
  const [open, setOpen] = useState(false)
  if (!amounts.resolved || !amounts.debitAmount || !amounts.receiveAmount) return null

  const debit = amounts.debitAmount
  const receive = amounts.receiveAmount
  const debitMajor = Number(debit.value) / 10 ** debit.assetScale
  const receiveMajor = Number(receive.value) / 10 ** receive.assetScale
  const sameCurrency = debit.assetCode === receive.assetCode
  const rate = debitMajor ? receiveMajor / debitMajor : 0
  const estimated = Boolean(amounts.approxSide)
  const expires = amounts.expiresAt ? new Date(amounts.expiresAt) : undefined
  const expiresValid = expires && !Number.isNaN(expires.getTime())

  return (
    <div className="quoteBreakdown">
      <button type="button" className="quoteBreakdownHeader" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="quoteBreakdownChevron">{open ? '▾' : '▸'}</span>
        <span className="quoteBreakdownTitle">Quote{estimated ? ' · ≈ estimated' : ''}</span>
        {!open ? (
          <span className="quoteBreakdownSummary">
            {approxAmount('debit', amounts.approxSide, debit)} → {approxAmount('receive', amounts.approxSide, receive)}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="quoteBreakdownBody">
          <div className="quoteBreakdownRow">
            <span>Sender pays</span>
            <strong>{fmtAmount(debit)}</strong>
          </div>
          <div className="quoteBreakdownRow">
            <span>Receiver gets</span>
            <strong>{fmtAmount(receive)}</strong>
          </div>
          {!sameCurrency && rate > 0 ? (
            <div className="quoteBreakdownRow">
              <span>Implied rate</span>
              <span>
                1 {debit.assetCode} ≈ {rate.toFixed(4)} {receive.assetCode}
              </span>
            </div>
          ) : null}
          {expiresValid ? (
            <div className="quoteBreakdownRow">
              <span>Quote expires</span>
              <span>{expires!.toLocaleTimeString()}</span>
            </div>
          ) : null}
          {!sameCurrency ? (
            <div className="quoteBreakdownNote">
              The gap is FX and fees combined. Open Payments quotes do not itemize fees.
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
