import type { FlowDefinition, FlowExecutionSpec } from '../types.js'

// Recurring fixed-amount subscription: a Customer authorizes 12 monthly payments to a Service
// Provider who collects exactly €15.00 each period. The customer's account is in USD, so their
// bank debits the converted amount (≈$17.48) each month. Two distinct institutions are involved,
// so the graph models a Customer side and a Service-Provider side, each with its own Auth Server
// and Resource Server.
export const subscriptionFixedFlow: FlowDefinition = {
  id: 'subscription-fixed',
  title: 'Recurring Subscription (fixed amount)',
  description: 'A recurring subscription with a fixed RECEIVE amount. A Customer authorizes 12 monthly payments to a Service Provider who is paid exactly {receive} each period. The customer’s account is in {senderAsset}, so their bank debits the converted cost ({debit}) each month. Two distinct institutions are involved, so the graph models a Customer side and a Service Provider side, each with its own Auth Server and Resource Server.',
  nodes: [
    {
      id: 'client',
      kind: 'client',
      label: 'Client',
      position: { x: 0, y: 330 },
      description:
        'The Client is the program the service provider runs to drive billing. It holds a private key and signs every request. It talks to both wallets, both Auth Servers, and both Resource Servers to set up the subscription on the customer’s behalf.',
    },
    {
      id: 'customerWallet',
      kind: 'walletAddress',
      label: 'Customer Wallet',
      position: { x: 330, y: 30 },
      description:
        'The Customer Wallet is the public URL of the subscriber who pays. Fetching it reveals the customer\’s Auth Server, Resource Server, and currency ({senderAsset}). This is the account that is debited each month: the converted cost ({debit}) of the {receive} charge.',
    },
    {
      id: 'spWallet',
      kind: 'walletAddress',
      label: 'Service Provider Wallet',
      position: { x: 330, y: 660 },
      description:
        'The Service Provider Wallet is the public URL of the business being paid. Fetching it tells the Client where to create the incoming-payment and which servers the provider trusts. It receives exactly {receive} each billing period.',
    },
    {
      id: 'customerAuth',
      kind: 'authServer',
      label: 'Customer Auth Server',
      position: { x: 700, y: 120 },
      description:
        'The Customer Auth Server (GNAP) controls permission to act on the customer’s account. It issues tokens for the quote and, crucially, the interactive recurring outgoing-payment grant the customer must consent to.',
    },
    {
      id: 'customerResource',
      kind: 'resourceServer',
      label: 'Customer Resource Server',
      position: { x: 700, y: 250 },
      description:
        'The Customer Resource Server is the customer wallet’s API. With a valid token, this is where the quote and the outgoing-payment resources are created.',
    },
    {
      id: 'spAuth',
      kind: 'authServer',
      label: 'Service Provider Auth Server',
      position: { x: 700, y: 360 },
      description:
        'The Service Provider Auth Server (GNAP) controls permission to act on the provider\’s account. It issues the token that lets the Client create an incoming-payment on the provider\’s wallet; no human approval needed for receiving money.',
    },
    {
      id: 'spResource',
      kind: 'resourceServer',
      label: 'Service Provider Resource Server',
      position: { x: 700, y: 480 },
      description:
        'The Service Provider Resource Server is the provider wallet’s API, where the incoming-payment that will receive the {receive} is created.',
    },
    {
      id: 'incomingPayment',
      kind: 'incomingPayment',
      label: 'Incoming Payment',
      position: { x: 1060, y: 600 },
      description:
        'An incoming-payment is a resource on the Service Provider Resource Server expecting money. Here it has a fixed incomingAmount of {receive}, so the provider receives exactly that each period.',
    },
    {
      id: 'quote',
      kind: 'quote',
      label: 'Quote',
      position: { x: 1060, y: 250 },
      description:
        'A quote is a firm price created on the Customer Resource Server. It locks in the debitAmount the customer pays ({debit}) to deliver {receive} to the provider’s incoming-payment, including any fees or conversion. The quoted price is valid only briefly before it expires.',
    },
    {
      id: 'outgoingPayment',
      kind: 'outgoingPayment',
      label: 'Outgoing Payment',
      position: { x: 1060, y: 70 },
      description:
        'An outgoing-payment is an instruction to the customer\’s account-servicing entity (the bank behind the Resource Server) to make a payment; creating it does not move money by itself. It references the quote and the provider\’s incoming-payment. This first one is the month-1 instruction; the recurring grant pre-authorizes the next 11. The account-servicing entity settles each transfer out of band.',
    },
  ],
  edges: [
    {
      id: 'e-sub-disc-c',
      kind: 'request',
      source: 'client',
      target: 'customerWallet',
      label: 'GET wallet address',
      stepId: 'sub-wallet-resolve',
      description:
        'An unauthenticated GET on the Customer Wallet URL returns its public details: the customer’s Auth Server, Resource Server, asset code, and asset scale.',
    },
    {
      id: 'e-sub-disc-s',
      kind: 'request',
      source: 'client',
      target: 'spWallet',
      label: 'GET wallet address',
      stepId: 'sub-wallet-resolve',
      description:
        'The same public lookup against the Service Provider Wallet URL, so the Client knows where to create the incoming-payment.',
    },
    {
      id: 'e-sub-grant-in',
      kind: 'request',
      source: 'client',
      target: 'spAuth',
      label: 'Grant (incoming)',
      stepId: 'sub-grant-incoming',
      description:
        'The Client asks the Service Provider Auth Server for a grant to create an incoming-payment. Receiving money needs no human approval, so a token returns immediately.',
    },
    {
      id: 'e-sub-ip',
      kind: 'request',
      source: 'client',
      target: 'spResource',
      label: 'Create Incoming Payment',
      stepId: 'sub-incoming-payment',
      description:
        'Using that token, the Client creates the incoming-payment with a fixed incomingAmount of {receive} on the Service Provider Resource Server.',
    },
    {
      id: 'e-sub-grant-quote',
      kind: 'request',
      source: 'client',
      target: 'customerAuth',
      label: 'Grant (quote)',
      stepId: 'sub-grant-quote',
      description:
        'The Client requests a non-interactive grant from the Customer Auth Server for permission to create a quote.',
    },
    {
      id: 'e-sub-quote',
      kind: 'request',
      source: 'client',
      target: 'customerResource',
      label: 'Create Quote',
      stepId: 'sub-quote',
      description:
        'With the quote token, the Client asks the Customer Resource Server to price delivering {receive} to the provider’s incoming-payment. The response includes the debitAmount the customer will pay ({debit}).',
    },
    {
      id: 'e-sub-grant-out',
      kind: 'request',
      source: 'client',
      target: 'customerAuth',
      label: 'Grant (recurring outgoing)',
      stepId: 'sub-grant-outgoing-interactive',
      description:
        'The Client requests an interactive outgoing-payment grant carrying limits (debitAmount, in the customer\’s {senderAsset}) and an interval (R12/…/P1M), permission to pay the {receive} charge ({debit}) once a month for 12 months. Because it authorizes real payments, the Auth Server returns a consent redirect instead of a token.',
    },
    {
      id: 'e-sub-consent',
      kind: 'redirect',
      source: 'customerAuth',
      target: 'client',
      label: 'interact.redirect',
      stepId: 'sub-grant-outgoing-interactive',
      description:
        'The Customer Auth Server returns a redirect URL. The customer opens it and approves the recurring authorization once; this single consent covers all 12 monthly payments.',
    },
    {
      id: 'e-sub-grant-cont',
      kind: 'request',
      source: 'client',
      target: 'customerAuth',
      label: 'Continue grant',
      stepId: 'sub-grant-outgoing-continue',
      description:
        'After consent, the Client returns to the Customer Auth Server with the interaction reference to continue the grant and collect the access token.',
    },
    {
      id: 'e-sub-op',
      kind: 'request',
      source: 'client',
      target: 'customerResource',
      label: 'Create Outgoing Payment',
      stepId: 'sub-outgoing-payment',
      description:
        'Holding the consented token, the Client creates the first outgoing-payment on the Customer Resource Server, using the quote. This is month 1 of 12.',
    },
    {
      id: 'e-sub-create-ip',
      kind: 'creation',
      source: 'spResource',
      target: 'incomingPayment',
      label: 'creates',
      description:
        'The incoming-payment ({receive} fixed) is created and hosted on the Service Provider\’s Resource Server. The Client’s "Create Incoming Payment" request lands here, and the server materialises the destination resource.',
    },
    {
      id: 'e-sub-create-q',
      kind: 'creation',
      source: 'customerResource',
      target: 'quote',
      label: 'creates',
      description:
        'The quote is created and hosted on the Customer’s Resource Server. The Client’s "Create Quote" request lands here, and the server materialises the firm price the customer will pay.',
    },
    {
      id: 'e-sub-create-op',
      kind: 'creation',
      source: 'customerResource',
      target: 'outgoingPayment',
      label: 'creates',
      description:
        'The outgoing-payment is created and hosted on the Customer\’s Resource Server. The Client\’s "Create Outgoing Payment" request lands here, and the server records the payment instruction. The customer\’s account-servicing entity then performs the actual transfer out of band, debiting {debit} to deliver {receive} to the provider.',
    },
  ],
  steps: [
    {
      id: 'sub-wallet-resolve',
      kind: 'wallet.resolve',
      title: 'Resolve wallet addresses',
      group: 'Discovery',
      involvedNodeIds: ['client', 'customerWallet', 'spWallet'],
      involvedEdgeIds: ['e-sub-disc-c', 'e-sub-disc-s'],
      description:
        'The Client fetches the public details of the Customer Wallet and Service Provider Wallet to learn each side’s Auth Server, Resource Server, and currency before doing anything else.',
      nodeRoles: {
        client:
          'The Client does the lookups: a public GET to each wallet address to discover both banks’ servers.',
        customerWallet:
          'Being looked up right now; its details reveal the Customer Auth Server and Resource Server that will handle the quote and the payment.',
        spWallet:
          'Being looked up so the Client knows where to create the provider’s incoming-payment.',
      },
    },
    {
      id: 'sub-grant-incoming',
      kind: 'grant.request',
      title: 'Grant for incoming payment',
      group: 'Incoming payment',
      involvedNodeIds: ['client', 'spAuth'],
      involvedEdgeIds: ['e-sub-grant-in'],
      description:
        'The Client obtains a non-interactive grant from the Service Provider Auth Server allowing it to create an incoming-payment.',
      nodeRoles: {
        client: 'The Client asks the provider’s bank for permission to set up an incoming-payment.',
        spAuth:
          'The Service Provider Auth Server approves automatically (receiving money needs no consent) and issues a token.',
      },
    },
    {
      id: 'sub-incoming-payment',
      kind: 'incomingPayment.create',
      title: 'Create incoming payment (fixed amount)',
      group: 'Incoming payment',
      involvedNodeIds: ['client', 'spResource', 'incomingPayment'],
      involvedEdgeIds: ['e-sub-ip', 'e-sub-create-ip'],
      description:
        'The Client creates the incoming-payment with a fixed incomingAmount of {receive} on the Service Provider\’s Resource Server, guaranteeing the provider receives exactly {receive} this period.',
      nodeRoles: {
        client: 'The Client presents its token and requests the incoming-payment with incomingAmount {receive}.',
        spResource: 'The Service Provider Resource Server creates the incoming-payment resource.',
        incomingPayment: 'The incoming-payment is created here: the {receive} destination for this billing period.',
      },
    },
    {
      id: 'sub-grant-quote',
      kind: 'grant.request',
      title: 'Grant for quote',
      group: 'Quote',
      involvedNodeIds: ['client', 'customerAuth'],
      involvedEdgeIds: ['e-sub-grant-quote'],
      description:
        'The Client obtains a non-interactive grant from the Customer\’s Auth Server allowing it to create a quote (pricing only, not spending).',
      nodeRoles: {
        client: 'The Client asks the customer’s bank for permission to create a quote.',
        customerAuth: 'The Customer\’s Auth Server issues a quote token automatically; pricing needs no consent.',
      },
    },
    {
      id: 'sub-quote',
      kind: 'quote.create',
      title: 'Create quote',
      group: 'Quote',
      involvedNodeIds: ['client', 'customerResource', 'quote'],
      involvedEdgeIds: ['e-sub-quote', 'e-sub-create-q'],
      description:
        'The Client creates a quote on the Customer Resource Server, naming the provider’s incoming-payment as receiver. The quote derives the debitAmount the customer pays ({debit}) to deliver the fixed {receive}.',
      nodeRoles: {
        client: 'The Client asks for a firm price to deliver {receive} to the provider’s incoming-payment.',
        customerResource: 'The Customer Resource Server computes the cost ({debit} after conversion) and returns the quote.',
        quote: 'The quote is created here, locking in the customer’s {senderAsset} debit amount for this payment.',
      },
    },
    {
      id: 'sub-grant-outgoing-interactive',
      kind: 'grant.interactive_required',
      title: 'Interactive recurring grant',
      group: 'Outgoing payment',
      involvedNodeIds: ['client', 'customerAuth'],
      involvedEdgeIds: ['e-sub-grant-out', 'e-sub-consent'],
      description:
        'The Client requests an interactive outgoing-payment grant with limits (debitAmount, in {senderAsset}) and an interval of R12/…/P1M, authorizing payment of the {receive} charge ({debit}) monthly for 12 months. The Customer Auth Server returns a redirect for the customer to consent once.',
      nodeRoles: {
        client:
          'The Client requests permission to charge the customer the {receive} fee ({debit}) a month for 12 months, sending the limits and interval.',
        customerAuth:
          'Because a real payment is being authorized, the Customer’s Auth Server won’t auto-approve. It returns a consent redirect; approving it authorizes all 12 payments at once.',
      },
    },
    {
      id: 'sub-grant-outgoing-continue',
      kind: 'grant.continue',
      title: 'Continue grant after consent',
      group: 'Outgoing payment',
      involvedNodeIds: ['client', 'customerAuth'],
      involvedEdgeIds: ['e-sub-grant-cont'],
      description:
        'After the Customer approves, the Client continues the grant with the Customer\’s Auth Server to obtain the recurring access token.',
      nodeRoles: {
        client: 'After consent, the Client returns with the interaction reference to finish the grant and collect the token.',
        customerAuth: 'The Customer\’s Auth Server verifies the completed consent and issues the recurring access token.',
      },
    },
    {
      id: 'sub-outgoing-payment',
      kind: 'outgoingPayment.create',
      title: 'Create outgoing payment (month 1)',
      group: 'Outgoing payment',
      involvedNodeIds: ['client', 'customerResource', 'outgoingPayment'],
      involvedEdgeIds: ['e-sub-op', 'e-sub-create-op'],
      description:
        'The Client creates the first outgoing-payment instruction on the Customer’s Resource Server using the quote. This records month 1 of the subscription; the customer’s account-servicing entity then settles the transfer, so {debit} leaves the Customer Wallet and {receive} reaches the provider’s incoming-payment.',
      nodeRoles: {
        client: 'The Client uses the recurring token and the quote to create the first month’s outgoing-payment instruction.',
        customerResource: 'The Customer Resource Server records the outgoing-payment instruction; its account-servicing entity carries out the transfer.',
        outgoingPayment: 'The outgoing-payment instruction is created here: month 1 of 12. The funds leave the Customer Wallet only once the account-servicing entity settles it.',
      },
    },
    {
      id: 'sub-recurring',
      kind: 'generic',
      title: 'Recurring billing (months 2–12)',
      group: 'Recurring',
      involvedNodeIds: ['client', 'customerWallet', 'outgoingPayment', 'incomingPayment'],
      involvedEdgeIds: [],
      description:
        'No new grants are needed for the remaining 11 months. The recurring grant stays valid, so each month the Client simply repeats three steps: create a new incoming-payment ({receive}), create a quote, and create an outgoing-payment. If a token expires, it can be rotated without re-consent.',
      nodeRoles: {
        client:
          'Each interval the Client repeats create-incoming-payment, create-quote, and create-outgoing-payment, reusing the same recurring grant.',
        customerWallet: 'A fresh payment is instructed against the Customer Wallet each month automatically, without re-approving; the account-servicing entity settles each one.',
        outgoingPayment: 'A fresh outgoing-payment instruction is created every month for 11 more months.',
        incomingPayment: 'A fresh incoming-payment ({receive} fixed) is created on the provider each month.',
      },
    },
  ],
}

export const subscriptionFixedSpec: FlowExecutionSpec = {
  scenarioId: 'subscription-fixed',
  steps: {
    walletResolve: 'sub-wallet-resolve',
    incomingGrant: 'sub-grant-incoming',
    incomingPayment: 'sub-incoming-payment',
    quoteGrant: 'sub-grant-quote',
    quote: 'sub-quote',
    outgoingGrantInteractive: 'sub-grant-outgoing-interactive',
    outgoingGrantContinue: 'sub-grant-outgoing-continue',
    outgoingPayment: 'sub-outgoing-payment',
    recurring: 'sub-recurring',
  },
  // Fixed-RECEIVE: the Service Provider collects exactly €15.00 each period and the customer's
  // USD account is debited the variable converted amount (≈$17.48). The display hints drive the
  // mock's "≈" USD estimate (1 EUR ≈ 1.165 USD); the real runner uses the live wallets + quote.
  incomingAmount: { value: '1500', assetCode: 'EUR', assetScale: 2 },
  display: { counterpartyAsset: { assetCode: 'USD', assetScale: 2 }, fxRate: 1.165 },
  outgoingInterval: 'R12/2025-10-14T00:03:00Z/P1M',
}
