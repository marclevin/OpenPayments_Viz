export type EntityColorVar =
  | '--entityClient'
  | '--entitySenderWallet'
  | '--entityReceiverWallet'
  | '--entityAuthServer'
  | '--entityResourceServer'
  | '--entityPayment'
  | '--accent'

export function getEntityColorVar(label: string, kind?: string): EntityColorVar {
  const l = label.toLowerCase()
  // Payer-side wallets (sender / customer) share one color; payee-side (receiver / service provider) another.
  if (l.includes('wallet') && (l.includes('sender') || l.includes('customer'))) return '--entitySenderWallet'
  if (l.includes('wallet') && (l.includes('receiver') || l.includes('provider'))) return '--entityReceiverWallet'
  if (l === 'client' || kind === 'client') return '--entityClient'
  if (l.includes('auth') || kind === 'authServer') return '--entityAuthServer'
  if (l.includes('resource') || kind === 'resourceServer') return '--entityResourceServer'
  if (l.includes('incoming') || l.includes('outgoing') || l.includes('quote')) return '--entityPayment'
  return '--accent'
}

export function entityStyle(label: string, kind?: string) {
  return { color: `var(${getEntityColorVar(label, kind)})` }
}

export function highlightEntities(text: string): Array<string | { t: string; varName: EntityColorVar }> {
  // Minimal tokenization for the initial flow.
  // Later: derive from Flow DSL node labels.
  const tokens: Array<{ match: RegExp; varName: EntityColorVar }> = [
    { match: /\bClient\b/g, varName: '--entityClient' },
    { match: /\bSender Wallet\b/g, varName: '--entitySenderWallet' },
    { match: /\bCustomer Wallet\b/g, varName: '--entitySenderWallet' },
    { match: /\bReceiver Wallet\b/g, varName: '--entityReceiverWallet' },
    { match: /\bService Provider Wallet\b/g, varName: '--entityReceiverWallet' },
    { match: /\bAuth Server\b/g, varName: '--entityAuthServer' },
    { match: /\bResource Server\b/g, varName: '--entityResourceServer' },
    { match: /\bIncoming Payment\b/g, varName: '--entityPayment' },
    { match: /\bOutgoing Payment\b/g, varName: '--entityPayment' },
    { match: /\bincoming-payment\b/g, varName: '--entityPayment' },
    { match: /\boutgoing-payment\b/g, varName: '--entityPayment' },
    { match: /\bQuote\b/g, varName: '--entityPayment' },
    { match: /\bquote\b/g, varName: '--entityPayment' },
    { match: /\bgrant\b/g, varName: '--entityAuthServer' },
  ]

  // Find earliest next match among all tokens, iteratively.
  const out: Array<string | { t: string; varName: EntityColorVar }> = []
  let i = 0

  while (i < text.length) {
    let best:
      | { start: number; end: number; varName: EntityColorVar; value: string }
      | undefined

    for (const tok of tokens) {
      tok.match.lastIndex = i
      const m = tok.match.exec(text)
      if (!m) continue
      const start = m.index
      const end = start + m[0].length
      if (!best || start < best.start) {
        best = { start, end, varName: tok.varName, value: m[0] }
      }
    }

    if (!best) {
      out.push(text.slice(i))
      break
    }

    if (best.start > i) out.push(text.slice(i, best.start))
    out.push({ t: best.value, varName: best.varName })
    i = best.end
  }

  return out
}

