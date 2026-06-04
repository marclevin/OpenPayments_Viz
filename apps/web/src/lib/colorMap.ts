export type EntityColorVar =
  | '--entityClient'
  | '--entitySenderWallet'
  | '--entityReceiverWallet'
  | '--entityPlatformWallet'
  | '--entityAuthServer'
  | '--entityAuthServerB'
  | '--entityAuthServerC'
  | '--entityResourceServer'
  | '--entityResourceServerB'
  | '--entityResourceServerC'
  | '--entityPayment'
  | '--accent'

// Scenarios with two institutions (e.g. the subscription flow) have a payer side and a payee
// side, each with its own Auth + Resource server. Detect the payee side from the label so its
// servers render in a distinct colour instead of colliding with the payer's.
function isPayeeSide(label: string): boolean {
  return /provider|receiver|merchant|payee|service/.test(label)
}

// A distinct third party (the marketplace operator in the split-payment scenario). Checked before
// the generic payee detection so its servers don't collide with the merchant/payee-B colors.
function isThirdParty(label: string): boolean {
  return /platform/.test(label)
}

export function getEntityColorVar(label: string, kind?: string): EntityColorVar {
  const l = label.toLowerCase()
  // Payer-side wallets (sender / customer) share one color; payee-side (receiver / provider /
  // merchant) another; the platform (split-payment fee recipient) gets a third.
  if (l.includes('wallet') && (l.includes('sender') || l.includes('customer'))) return '--entitySenderWallet'
  if (l.includes('wallet') && isThirdParty(l)) return '--entityPlatformWallet'
  if (l.includes('wallet') && (l.includes('receiver') || l.includes('provider') || l.includes('merchant')))
    return '--entityReceiverWallet'
  if (l === 'client' || kind === 'client') return '--entityClient'
  if (l.includes('auth') || kind === 'authServer')
    return isThirdParty(l) ? '--entityAuthServerC' : isPayeeSide(l) ? '--entityAuthServerB' : '--entityAuthServer'
  if (l.includes('resource') || kind === 'resourceServer')
    return isThirdParty(l) ? '--entityResourceServerC' : isPayeeSide(l) ? '--entityResourceServerB' : '--entityResourceServer'
  if (l.includes('incoming') || l.includes('outgoing') || l.includes('quote')) return '--entityPayment'
  return '--accent'
}

// Which side of the payment a resource belongs to, for the node's accent stripe. Payment
// resources keep their green entity colour for the icon (money identity) but carry a warm
// (sender) or teal (receiver) stripe so students can see which wallet owns them. Wallets
// already encode their side via the entity colour, so the stripe simply matches.
export function getSideAccentVar(label: string): '--entitySenderWallet' | '--entityReceiverWallet' | undefined {
  const l = label.toLowerCase()
  if (/sender|customer|outgoing|quote/.test(l)) return '--entitySenderWallet'
  if (/receiver|incoming/.test(l) || isPayeeSide(l)) return '--entityReceiverWallet'
  return undefined
}

// Minimal tokenization for the initial flow. Later: derive from Flow DSL node labels.
// Hoisted to module scope so the (24-entry) regex array isn't rebuilt on every call —
// highlightEntities runs once per narrated event. Each regex's lastIndex is reset before
// every exec below, so sharing the objects across calls is safe.
const highlightTokens: Array<{ match: RegExp; varName: EntityColorVar }> = [
  { match: /\bClient\b/g, varName: '--entityClient' },

    // Wallets (payer side gold, payee side teal).
    { match: /\bSender Wallet\b/g, varName: '--entitySenderWallet' },
    { match: /\bCustomer Wallet\b/g, varName: '--entitySenderWallet' },
    { match: /\bReceiver Wallet\b/g, varName: '--entityReceiverWallet' },
    { match: /\bService Provider Wallet\b/g, varName: '--entityReceiverWallet' },
    { match: /\bMerchant Wallet\b/g, varName: '--entityReceiverWallet' },
    { match: /\bPlatform Wallet\b/g, varName: '--entityPlatformWallet' },

    // Qualified servers in two-institution scenarios. These MUST precede the bare
    // "Customer"/"Service Provider" and the generic "Auth/Resource Server" tokens so the whole
    // compound name ("Customer Auth Server") is coloured as one entity — matching the graph,
    // where getEntityColorVar gives payee-side servers ("Service Provider"/"Provider"/"Merchant"/
    // "Receiver"/"Payee") the B colours and payer-side ("Customer"/"Sender"/"Payer") the defaults.
    // The optional possessive handles "Customer’s Auth Server".
    { match: /\bPlatform(?:['’]s)?\s+Auth Server\b/g, varName: '--entityAuthServerC' },
    { match: /\bPlatform(?:['’]s)?\s+Resource Server\b/g, varName: '--entityResourceServerC' },
    { match: /\b(?:Service Provider|Provider|Merchant|Payee|Receiver)(?:['’]s)?\s+Auth Server\b/g, varName: '--entityAuthServerB' },
    { match: /\b(?:Service Provider|Provider|Merchant|Payee|Receiver)(?:['’]s)?\s+Resource Server\b/g, varName: '--entityResourceServerB' },
    { match: /\b(?:Customer|Sender|Payer)(?:['’]s)?\s+Auth Server\b/g, varName: '--entityAuthServer' },
    { match: /\b(?:Customer|Sender|Payer)(?:['’]s)?\s+Resource Server\b/g, varName: '--entityResourceServer' },

    // Generic / single-institution fallback (e.g. the p2p flow's lone Auth/Resource Server).
    { match: /\bAuth Server\b/g, varName: '--entityAuthServer' },
    { match: /\bResource Server\b/g, varName: '--entityResourceServer' },

    { match: /\bIncoming Payment\b/g, varName: '--entityPayment' },
    { match: /\bOutgoing Payment\b/g, varName: '--entityPayment' },
    { match: /\bincoming-payment\b/g, varName: '--entityPayment' },
    { match: /\boutgoing-payment\b/g, varName: '--entityPayment' },
    { match: /\bquote\b/gi, varName: '--entityPayment' },
    { match: /\bgrant\b/g, varName: '--entityAuthServer' },

    // Bare institution words (lowest priority) — colour the actor to match its wallet's side.
    { match: /\bCustomer\b/g, varName: '--entitySenderWallet' },
    { match: /\bService Provider\b/g, varName: '--entityReceiverWallet' },
    { match: /\bMerchant\b/g, varName: '--entityReceiverWallet' },
    { match: /\bPlatform\b/g, varName: '--entityPlatformWallet' },
]

export function highlightEntities(text: string): Array<string | { t: string; varName: EntityColorVar }> {
  // Find earliest next match among all tokens, iteratively.
  const out: Array<string | { t: string; varName: EntityColorVar }> = []
  let i = 0

  while (i < text.length) {
    let best:
      | { start: number; end: number; varName: EntityColorVar; value: string }
      | undefined

    for (const tok of highlightTokens) {
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

