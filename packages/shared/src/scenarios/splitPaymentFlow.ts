import type { FlowDefinition, FlowExecutionSpec } from '../types.js'

// Split payment: a single $100.00 customer purchase is split so two recipients are paid directly
// — the Merchant receives $90.00 (90%) and the Platform keeps $10.00 (10%) as a marketplace fee.
// The key teaching point: Open Payments only issues instructions, so the money never passes
// through one party to reach the other. Each recipient gets its own incoming-payment, the customer
// gets a quote for each, and a single interactive consent (combined $100 limit) authorizes both
// outgoing payments. This scenario is illustrative and runs in Mocked mode only.
export const splitPaymentFlow: FlowDefinition = {
  id: 'split-payment',
  title: 'Split Payment (one payment, two recipients)',
  description:
    'A single $100.00 payment from a Customer is split between two recipients who are paid directly: the Merchant receives $90.00 (90%) and the Platform keeps $10.00 (10%) as a marketplace fee. Open Payments only issues instructions, so funds never pass through one party to reach the other — each recipient has its own incoming-payment, the Customer gets a quote for each, and one interactive consent authorizes both outgoing payments.',
  mockOnly: true,
  mockOnlyReason:
    'This scenario involves multiple recipients, the current runner only supports one.',
  nodes: [
    {
      id: 'client',
      kind: 'client',
      label: 'Client',
      position: { x: 0, y: 380 },
      description:
        'The Client is the marketplace platform’s program driving the split. It holds a private key and signs every request. It talks to all three wallets, all three Auth Servers, and all three Resource Servers to set up two incoming-payments and two outgoing-payments on the customer’s behalf.',
    },
    {
      id: 'customerWallet',
      kind: 'walletAddress',
      label: 'Customer Wallet',
      position: { x: 320, y: 60 },
      description:
        'The Customer Wallet is the public URL of the buyer who pays. Fetching it reveals the customer’s Auth Server, Resource Server, and currency. The full $100.00 is debited from this account — split across two outgoing-payments.',
    },
    {
      id: 'customerAuth',
      kind: 'authServer',
      label: 'Customer Auth Server',
      position: { x: 700, y: 30 },
      description:
        'The Customer Auth Server (GNAP) controls permission to act on the customer’s account. It issues the quote token and, crucially, the single interactive outgoing-payment grant whose combined limit ($100) covers both payments.',
    },
    {
      id: 'customerResource',
      kind: 'resourceServer',
      label: 'Customer Resource Server',
      position: { x: 700, y: 150 },
      description:
        'The Customer Resource Server is the buyer wallet’s API. With valid tokens, this is where both quotes and both outgoing-payments are created.',
    },
    {
      id: 'merchantQuote',
      kind: 'quote',
      label: 'Quote · Merchant',
      position: { x: 1100, y: 20 },
      description:
        'A quote on the Customer Resource Server fixing the debitAmount the customer pays to deliver $90.00 to the Merchant’s incoming-payment.',
    },
    {
      id: 'platformQuote',
      kind: 'quote',
      label: 'Quote · Platform',
      position: { x: 1100, y: 300 },
      description:
        'A second quote on the Customer Resource Server fixing the debitAmount to deliver $10.00 to the Platform’s incoming-payment.',
    },
    {
      id: 'merchantOutgoing',
      kind: 'outgoingPayment',
      label: 'Outgoing · Merchant',
      position: { x: 1400, y: 70 },
      description:
        'The outgoing-payment that moves $90.00 out of the Customer Wallet to the Merchant’s incoming-payment, priced by the Merchant quote.',
    },
    {
      id: 'platformOutgoing',
      kind: 'outgoingPayment',
      label: 'Outgoing · Platform',
      position: { x: 1400, y: 250 },
      description:
        'The outgoing-payment that moves $10.00 out of the Customer Wallet to the Platform’s incoming-payment, priced by the Platform quote.',
    },
    {
      id: 'merchantWallet',
      kind: 'walletAddress',
      label: 'Merchant Wallet',
      position: { x: 0, y: 485 },
      description:
        'The Merchant Wallet is the public URL of the seller. Fetching it tells the Client where to create the Merchant incoming-payment and which servers the merchant trusts. It receives $90.00 directly.',
    },
    {
      id: 'merchantAuth',
      kind: 'authServer',
      label: 'Merchant Auth Server',
      position: { x: 700, y: 360 },
      description:
        'The Merchant Auth Server (GNAP) issues the token that lets the Client create an incoming-payment on the merchant’s wallet — no human approval needed for receiving money.',
    },
    {
      id: 'merchantResource',
      kind: 'resourceServer',
      label: 'Merchant Resource Server',
      position: { x: 700, y: 470 },
      description:
        'The Merchant Resource Server is the merchant wallet’s API, where the incoming-payment that will receive the $90.00 is created.',
    },
    {
      id: 'merchantIncoming',
      kind: 'incomingPayment',
      label: 'Incoming · Merchant',
      position: { x: 1100, y: 430 },
      description:
        'An incoming-payment on the Merchant Resource Server with a fixed incomingAmount of $90.00 — the merchant’s share of the purchase.',
    },
    {
      id: 'platformWallet',
      kind: 'walletAddress',
      label: 'Platform Wallet',
      position: { x: 320, y: 700 },
      description:
        'The Platform Wallet is the public URL of the marketplace operator (you). Fetching it tells the Client where to create the Platform incoming-payment. It receives the $10.00 fee directly — never routed through the merchant.',
    },
    {
      id: 'platformAuth',
      kind: 'authServer',
      label: 'Platform Auth Server',
      position: { x: 700, y: 660 },
      description:
        'The Platform Auth Server (GNAP) issues the token that lets the Client create an incoming-payment on the platform’s wallet for the fee — again, no consent needed to receive money.',
    },
    {
      id: 'platformResource',
      kind: 'resourceServer',
      label: 'Platform Resource Server',
      position: { x: 700, y: 770 },
      description:
        'The Platform Resource Server is the operator wallet’s API, where the incoming-payment that will receive the $10.00 fee is created.',
    },
    {
      id: 'platformIncoming',
      kind: 'incomingPayment',
      label: 'Incoming · Platform',
      position: { x: 1100, y: 730 },
      description:
        'An incoming-payment on the Platform Resource Server with a fixed incomingAmount of $10.00 — the marketplace fee.',
    },
  ],
  edges: [
    // Discovery: three wallet lookups.
    {
      id: 'e-sp-disc-c',
      kind: 'request',
      source: 'client',
      target: 'customerWallet',
      label: 'GET wallet address',
      stepId: 'split-wallet-resolve',
      description:
        'An unauthenticated GET on the Customer Wallet URL returns its public details: the customer’s Auth Server, Resource Server, asset code, and asset scale.',
    },
    {
      id: 'e-sp-disc-m',
      kind: 'request',
      source: 'client',
      target: 'merchantWallet',
      label: 'GET wallet address',
      stepId: 'split-wallet-resolve',
      description: 'The same public lookup against the Merchant Wallet URL, so the Client knows where to create the merchant’s incoming-payment.',
    },
    {
      id: 'e-sp-disc-p',
      kind: 'request',
      source: 'client',
      target: 'platformWallet',
      label: 'GET wallet address',
      stepId: 'split-wallet-resolve',
      description: 'The same public lookup against the Platform Wallet URL, so the Client knows where to create the platform’s fee incoming-payment.',
    },

    // Merchant incoming.
    {
      id: 'e-sp-grant-in-m',
      kind: 'request',
      source: 'client',
      target: 'merchantAuth',
      label: 'Grant (incoming)',
      stepId: 'split-grant-incoming-merchant',
      description: 'The Client asks the Merchant Auth Server for a grant to create an incoming-payment. Receiving money needs no consent, so a token returns immediately.',
    },
    {
      id: 'e-sp-ip-m',
      kind: 'request',
      source: 'client',
      target: 'merchantResource',
      label: 'Create Incoming Payment',
      stepId: 'split-incoming-merchant',
      description: 'Using that token, the Client creates the incoming-payment with a fixed incomingAmount of $90.00 on the Merchant Resource Server.',
    },
    {
      id: 'e-sp-create-ip-m',
      kind: 'creation',
      source: 'merchantResource',
      target: 'merchantIncoming',
      label: 'creates',
      description: 'The merchant’s incoming-payment ($90.00) is materialised here — the destination for the merchant’s share.',
    },

    // Platform incoming.
    {
      id: 'e-sp-grant-in-p',
      kind: 'request',
      source: 'client',
      target: 'platformAuth',
      label: 'Grant (incoming)',
      stepId: 'split-grant-incoming-platform',
      description: 'The Client asks the Platform Auth Server for a grant to create the fee incoming-payment. Again non-interactive — receiving money needs no consent.',
    },
    {
      id: 'e-sp-ip-p',
      kind: 'request',
      source: 'client',
      target: 'platformResource',
      label: 'Create Incoming Payment',
      stepId: 'split-incoming-platform',
      description: 'Using that token, the Client creates the incoming-payment with a fixed incomingAmount of $10.00 on the Platform Resource Server.',
    },
    {
      id: 'e-sp-create-ip-p',
      kind: 'creation',
      source: 'platformResource',
      target: 'platformIncoming',
      label: 'creates',
      description: 'The platform’s incoming-payment ($10.00) is materialised here — the destination for the marketplace fee.',
    },

    // Quote grant (one, customer side, reused for both quotes).
    {
      id: 'e-sp-grant-quote',
      kind: 'request',
      source: 'client',
      target: 'customerAuth',
      label: 'Grant (quote)',
      stepId: 'split-grant-quote',
      description: 'The Client requests a single non-interactive grant from the Customer Auth Server for permission to create quotes. The same token prices both recipients.',
    },
    // Merchant quote.
    {
      id: 'e-sp-quote-m',
      kind: 'request',
      source: 'client',
      target: 'customerResource',
      label: 'Create Quote (merchant)',
      stepId: 'split-quote-merchant',
      description: 'With the quote token, the Client asks the Customer Resource Server to price delivering $90.00 to the merchant’s incoming-payment.',
    },
    {
      id: 'e-sp-create-q-m',
      kind: 'creation',
      source: 'customerResource',
      target: 'merchantQuote',
      label: 'creates',
      description: 'The merchant quote is materialised here, locking in what the customer pays to deliver $90.00.',
    },
    // Platform quote.
    {
      id: 'e-sp-quote-p',
      kind: 'request',
      source: 'client',
      target: 'customerResource',
      label: 'Create Quote (platform)',
      stepId: 'split-quote-platform',
      description: 'Reusing the same quote token, the Client asks the Customer Resource Server to price delivering $10.00 to the platform’s incoming-payment.',
    },
    {
      id: 'e-sp-create-q-p',
      kind: 'creation',
      source: 'customerResource',
      target: 'platformQuote',
      label: 'creates',
      description: 'The platform quote is materialised here, locking in what the customer pays to deliver the $10.00 fee.',
    },

    // Interactive outgoing grant (one, combined limit) + consent redirect.
    {
      id: 'e-sp-grant-out',
      kind: 'request',
      source: 'client',
      target: 'customerAuth',
      label: 'Grant (outgoing, combined)',
      stepId: 'split-grant-outgoing-interactive',
      description: 'The Client requests one interactive outgoing-payment grant whose debitAmount limit is the combined total ($100.00) — enough to cover both payments. Because money moves, the Auth Server returns a consent redirect instead of a token.',
    },
    {
      id: 'e-sp-consent',
      kind: 'redirect',
      source: 'customerAuth',
      target: 'client',
      label: 'interact.redirect',
      stepId: 'split-grant-outgoing-interactive',
      description: 'The Customer Auth Server returns a redirect URL. The customer approves once — this single consent authorizes both the $90.00 and the $10.00 outgoing-payments.',
    },
    {
      id: 'e-sp-grant-cont',
      kind: 'request',
      source: 'client',
      target: 'customerAuth',
      label: 'Continue grant',
      stepId: 'split-grant-outgoing-continue',
      description: 'After consent, the Client returns to the Customer Auth Server with the interaction reference to continue the grant and collect the access token.',
    },

    // Outgoing payments (two, customer side).
    {
      id: 'e-sp-op-m',
      kind: 'request',
      source: 'client',
      target: 'customerResource',
      label: 'Create Outgoing Payment (merchant)',
      stepId: 'split-outgoing-merchant',
      description: 'Holding the consented token, the Client creates the first outgoing-payment using the merchant quote — $90.00 leaves the Customer Wallet for the merchant.',
    },
    {
      id: 'e-sp-create-op-m',
      kind: 'creation',
      source: 'customerResource',
      target: 'merchantOutgoing',
      label: 'creates',
      description: 'The merchant outgoing-payment is materialised here — $90.00 moves directly to the merchant’s incoming-payment.',
    },
    {
      id: 'e-sp-op-p',
      kind: 'request',
      source: 'client',
      target: 'customerResource',
      label: 'Create Outgoing Payment (platform)',
      stepId: 'split-outgoing-platform',
      description: 'Reusing the same consented token, the Client creates the second outgoing-payment using the platform quote — $10.00 leaves the Customer Wallet for the platform fee.',
    },
    {
      id: 'e-sp-create-op-p',
      kind: 'creation',
      source: 'customerResource',
      target: 'platformOutgoing',
      label: 'creates',
      description: 'The platform outgoing-payment is materialised here — the $10.00 fee moves directly to the platform’s incoming-payment.',
    },
  ],
  steps: [
    {
      id: 'split-wallet-resolve',
      kind: 'wallet.resolve',
      title: 'Resolve wallet addresses',
      group: 'Discovery',
      involvedNodeIds: ['client', 'customerWallet', 'merchantWallet', 'platformWallet'],
      involvedEdgeIds: ['e-sp-disc-c', 'e-sp-disc-m', 'e-sp-disc-p'],
      description:
        'The Client fetches the public details of all three wallets — Customer, Merchant, and Platform — to learn each side’s Auth Server, Resource Server, and currency before doing anything else.',
      nodeRoles: {
        client: 'The Client does the lookups: a public GET to each of the three wallet addresses.',
        customerWallet: 'Being looked up now; its details reveal the Customer Auth Server and Resource Server that handle the quotes and payments.',
        merchantWallet: 'Being looked up so the Client knows where to create the merchant’s incoming-payment.',
        platformWallet: 'Being looked up so the Client knows where to create the platform’s fee incoming-payment.',
      },
    },
    {
      id: 'split-grant-incoming-merchant',
      kind: 'grant.request',
      title: 'Grant for incoming payment (merchant)',
      group: 'Incoming payments',
      involvedNodeIds: ['client', 'merchantAuth'],
      involvedEdgeIds: ['e-sp-grant-in-m'],
      description: 'The Client obtains a non-interactive grant from the Merchant Auth Server allowing it to create an incoming-payment.',
      nodeRoles: {
        client: 'The Client asks the merchant’s bank for permission to set up an incoming-payment.',
        merchantAuth: 'The Merchant Auth Server approves automatically (receiving money needs no consent) and issues a token.',
      },
    },
    {
      id: 'split-incoming-merchant',
      kind: 'incomingPayment.create',
      title: 'Create incoming payment ($90 merchant)',
      group: 'Incoming payments',
      involvedNodeIds: ['client', 'merchantResource', 'merchantIncoming'],
      involvedEdgeIds: ['e-sp-ip-m', 'e-sp-create-ip-m'],
      description: 'The Client creates the incoming-payment with a fixed incomingAmount of $90.00 on the Merchant Resource Server — the merchant’s share.',
      nodeRoles: {
        client: 'The Client presents its token and requests the incoming-payment with incomingAmount $90.00.',
        merchantResource: 'The Merchant Resource Server creates the incoming-payment resource.',
        merchantIncoming: 'The incoming-payment is created here — the $90.00 destination for the merchant.',
      },
    },
    {
      id: 'split-grant-incoming-platform',
      kind: 'grant.request',
      title: 'Grant for incoming payment (platform)',
      group: 'Incoming payments',
      involvedNodeIds: ['client', 'platformAuth'],
      involvedEdgeIds: ['e-sp-grant-in-p'],
      description: 'The Client obtains a separate non-interactive grant from the Platform Auth Server allowing it to create the fee incoming-payment.',
      nodeRoles: {
        client: 'The Client asks the platform’s bank for permission to set up the fee incoming-payment.',
        platformAuth: 'The Platform Auth Server approves automatically and issues a token.',
      },
    },
    {
      id: 'split-incoming-platform',
      kind: 'incomingPayment.create',
      title: 'Create incoming payment ($10 fee)',
      group: 'Incoming payments',
      involvedNodeIds: ['client', 'platformResource', 'platformIncoming'],
      involvedEdgeIds: ['e-sp-ip-p', 'e-sp-create-ip-p'],
      description: 'The Client creates the incoming-payment with a fixed incomingAmount of $10.00 on the Platform Resource Server — the marketplace fee.',
      nodeRoles: {
        client: 'The Client presents its token and requests the incoming-payment with incomingAmount $10.00.',
        platformResource: 'The Platform Resource Server creates the incoming-payment resource.',
        platformIncoming: 'The incoming-payment is created here — the $10.00 fee destination for the platform.',
      },
    },
    {
      id: 'split-grant-quote',
      kind: 'grant.request',
      title: 'Grant for quotes',
      group: 'Quotes',
      involvedNodeIds: ['client', 'customerAuth'],
      involvedEdgeIds: ['e-sp-grant-quote'],
      description: 'The Client obtains a single non-interactive grant from the Customer Auth Server allowing it to create quotes. The same token prices both recipients.',
      nodeRoles: {
        client: 'The Client asks the customer’s bank for permission to create quotes.',
        customerAuth: 'The Customer Auth Server issues a quote token automatically — pricing needs no consent.',
      },
    },
    {
      id: 'split-quote-merchant',
      kind: 'quote.create',
      title: 'Create quote (merchant)',
      group: 'Quotes',
      involvedNodeIds: ['client', 'customerResource', 'merchantQuote'],
      involvedEdgeIds: ['e-sp-quote-m', 'e-sp-create-q-m'],
      description: 'The Client creates a quote on the Customer Resource Server naming the merchant’s incoming-payment as receiver, fixing the debitAmount to deliver $90.00.',
      nodeRoles: {
        client: 'The Client asks for a firm price to send $90.00 to the merchant’s incoming-payment.',
        customerResource: 'The Customer Resource Server computes the cost and returns the merchant quote.',
        merchantQuote: 'The merchant quote is created here, locking in the customer’s debit for the merchant’s share.',
      },
    },
    {
      id: 'split-quote-platform',
      kind: 'quote.create',
      title: 'Create quote (platform)',
      group: 'Quotes',
      involvedNodeIds: ['client', 'customerResource', 'platformQuote'],
      involvedEdgeIds: ['e-sp-quote-p', 'e-sp-create-q-p'],
      description: 'Reusing the same quote token, the Client creates a second quote naming the platform’s incoming-payment as receiver, fixing the debitAmount to deliver $10.00.',
      nodeRoles: {
        client: 'The Client asks for a firm price to send $10.00 to the platform’s incoming-payment.',
        customerResource: 'The Customer Resource Server computes the cost and returns the platform quote.',
        platformQuote: 'The platform quote is created here, locking in the customer’s debit for the fee.',
      },
    },
    {
      id: 'split-grant-outgoing-interactive',
      kind: 'grant.interactive_required',
      title: 'Interactive grant (combined $100)',
      group: 'Outgoing payments',
      involvedNodeIds: ['client', 'customerAuth'],
      involvedEdgeIds: ['e-sp-grant-out', 'e-sp-consent'],
      description: 'The Client requests one interactive outgoing-payment grant with a combined debitAmount limit of $100.00 — enough for both payments. The Customer Auth Server returns a redirect for the customer to consent once.',
      nodeRoles: {
        client: 'The Client requests permission to send both payments, sending a combined limit of $100.00.',
        customerAuth: 'Because real money will move, the Customer Auth Server won’t auto-approve. It returns a consent redirect; approving it authorizes both outgoing-payments at once.',
      },
    },
    {
      id: 'split-grant-outgoing-continue',
      kind: 'grant.continue',
      title: 'Continue grant after consent',
      group: 'Outgoing payments',
      involvedNodeIds: ['client', 'customerAuth'],
      involvedEdgeIds: ['e-sp-grant-cont'],
      description: 'After the Customer approves, the Client continues the grant with the Customer Auth Server to obtain the outgoing-payment access token.',
      nodeRoles: {
        client: 'After consent, the Client returns with the interaction reference to finish the grant and collect the token.',
        customerAuth: 'The Customer Auth Server verifies the completed consent and issues the access token covering both payments.',
      },
    },
    {
      id: 'split-outgoing-merchant',
      kind: 'outgoingPayment.create',
      title: 'Create outgoing payment ($90 merchant)',
      group: 'Outgoing payments',
      involvedNodeIds: ['client', 'customerResource', 'merchantOutgoing'],
      involvedEdgeIds: ['e-sp-op-m', 'e-sp-create-op-m'],
      description: 'The Client creates the first outgoing-payment on the Customer Resource Server using the merchant quote. $90.00 leaves the Customer Wallet and arrives directly at the merchant’s incoming-payment.',
      nodeRoles: {
        client: 'The Client uses the consented token and the merchant quote to create the merchant outgoing-payment.',
        customerResource: 'The Customer Resource Server executes the transfer, creating the outgoing-payment.',
        merchantOutgoing: 'The outgoing-payment is created here — $90.00 leaves the Customer Wallet for the merchant.',
      },
    },
    {
      id: 'split-outgoing-platform',
      kind: 'outgoingPayment.create',
      title: 'Create outgoing payment ($10 fee)',
      group: 'Outgoing payments',
      involvedNodeIds: ['client', 'customerResource', 'platformOutgoing'],
      involvedEdgeIds: ['e-sp-op-p', 'e-sp-create-op-p'],
      description: 'Reusing the same consented token, the Client creates the second outgoing-payment using the platform quote. $10.00 leaves the Customer Wallet and arrives directly at the platform’s fee incoming-payment — never routed through the merchant.',
      nodeRoles: {
        client: 'The Client uses the same consented token and the platform quote to create the platform outgoing-payment.',
        customerResource: 'The Customer Resource Server executes the second transfer, creating the outgoing-payment.',
        platformOutgoing: 'The outgoing-payment is created here — the $10.00 fee leaves the Customer Wallet for the platform.',
      },
    },
  ],
}

export const splitPaymentSpec: FlowExecutionSpec = {
  scenarioId: 'split-payment',
  steps: {
    walletResolve: 'split-wallet-resolve',
    // Single-sequence fallbacks point at the merchant branch (used only by consumers that ignore
    // `recipients` — the mock generator below branches on `recipients` instead).
    incomingGrant: 'split-grant-incoming-merchant',
    incomingPayment: 'split-incoming-merchant',
    quoteGrant: 'split-grant-quote',
    quote: 'split-quote-merchant',
    outgoingGrantInteractive: 'split-grant-outgoing-interactive',
    outgoingGrantContinue: 'split-grant-outgoing-continue',
    outgoingPayment: 'split-outgoing-merchant',
  },
  // Combined customer debit total ($100.00).
  incomingAmount: { value: '10000', assetCode: 'USD', assetScale: 2 },
  recipients: [
    {
      key: 'merchant',
      label: 'Merchant',
      incomingAmount: { value: '9000', assetCode: 'USD', assetScale: 2 },
      steps: {
        incomingGrant: 'split-grant-incoming-merchant',
        incomingPayment: 'split-incoming-merchant',
        quote: 'split-quote-merchant',
        outgoingPayment: 'split-outgoing-merchant',
      },
    },
    {
      key: 'platform',
      label: 'Platform',
      incomingAmount: { value: '1000', assetCode: 'USD', assetScale: 2 },
      steps: {
        incomingGrant: 'split-grant-incoming-platform',
        incomingPayment: 'split-incoming-platform',
        quote: 'split-quote-platform',
        outgoingPayment: 'split-outgoing-platform',
      },
    },
  ],
}
