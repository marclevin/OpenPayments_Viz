import type { FlowDefinition } from '../types.js'

export const p2pExampleFlow: FlowDefinition = {
  id: 'p2p-example',
  title: 'One Time P2P Payment',
  description: 'A simple one-time peer-to-peer payment flow. Sender Wallet pays Receiver Wallet 10.00 USD fixed (Receiver always gets exactly 10.00 USD).',
  nodes: [
    {
      id: 'client',
      kind: 'client',
      label: 'Client',
      position: { x: 0, y: 230 },
      description:
        'The Client is the program driving the payment (here, the runner). It holds a private key and signs every request so servers can verify who is calling. It talks to wallet addresses, the Auth Server, and the Resource Server to arrange a payment on the sender’s behalf. Open Payments is an instruction layer: the Client never moves money itself, it asks the account-servicing entities to.',
    },
    {
      id: 'senderWallet',
      kind: 'walletAddress',
      label: 'Sender Wallet',
      position: { x: 260, y: 50 },
      description:
        'The Sender Wallet is a public URL identifying the account that pays. Fetching it reveals which Auth Server issues permission and which Resource Server holds the account, plus the currency it uses.',
    },
    {
      id: 'receiverWallet',
      kind: 'walletAddress',
      label: 'Receiver Wallet',
      position: { x: 260, y: 430 },
      description:
        'The Receiver Wallet is the public URL identifying the account that gets paid. The Client reads it to learn where to create the incoming-payment and which servers the recipient trusts.',
    },
    {
      id: 'auth',
      kind: 'authServer',
      label: 'Auth Server',
      position: { x: 580, y: 180 },
      description:
        'The Auth Server implements GNAP (Grant Negotiation and Authorization Protocol). It decides whether the Client may act and hands back an access token. Some actions are granted automatically; authorizing a payment requires the wallet owner to approve interactively.',
    },
    {
      id: 'resource',
      kind: 'resourceServer',
      label: 'Resource Server',
      position: { x: 560, y: 300 },
      description:
        'The Resource Server is the wallet’s API. Once the Client presents a valid access token, the Resource Server is where the incoming-payment, quote, and outgoing-payment resources are actually created.',
    },
    {
      id: 'incomingPayment',
      kind: 'incomingPayment',
      label: 'Incoming Payment',
      position: { x: 860, y: 430 },
      description:
        'An incoming-payment is a resource on the receiver’s Resource Server that says "this account is expecting money." It defines how much to receive and becomes the destination the payment is sent to.',
    },
    {
      id: 'quote',
      kind: 'quote',
      label: 'Quote',
      position: { x: 860, y: 110 },
      description:
        'A quote is a firm price for the transfer, created on the sender’s Resource Server. It locks in how much will be debited from the sender to deliver the requested amount to the receiver, including any fees or currency conversion.',
    },
    {
      id: 'outgoingPayment',
      kind: 'outgoingPayment',
      label: 'Outgoing Payment',
      position: { x: 860, y: 0 },
      description:
        'An outgoing-payment is an instruction to the sender’s account-servicing entity (the Resource Server) to make a payment — creating it does not move money by itself. It references the quote for the price and the incoming-payment as the destination, and it can only be created after the sender has consented. The account-servicing entity then settles the actual transfer out of band.',
    },
  ],
  edges: [
    {
      id: 'e-discovery-s',
      kind: 'request',
      source: 'client',
      target: 'senderWallet',
      label: 'GET wallet address',
      stepId: 'step-wallet-resolve',
      description:
        'The Client performs an unauthenticated GET on the Sender Wallet URL. The response is the wallet’s public details: its Auth Server, Resource Server, asset code, and asset scale.',
    },
    {
      id: 'e-discovery-r',
      kind: 'request',
      source: 'client',
      target: 'receiverWallet',
      label: 'GET wallet address',
      stepId: 'step-wallet-resolve',
      description:
        'The same public lookup against the Receiver Wallet URL, telling the Client where to create the incoming-payment and which servers the recipient uses.',
    },
    {
      id: 'e-grant-in',
      kind: 'request',
      source: 'client',
      target: 'auth',
      label: 'Grant (incoming)',
      stepId: 'step-grant-incoming',
      description:
        'The Client asks the receiver’s Auth Server for a grant to create an incoming-payment. This grant is non-interactive: no human approval is needed, so a token comes back immediately.',
    },
    {
      id: 'e-ip',
      kind: 'request',
      source: 'client',
      target: 'resource',
      label: 'Create Incoming Payment',
      stepId: 'step-incoming-payment',
      description:
        'Using the incoming grant’s token, the Client POSTs to the receiver’s Resource Server to create the incoming-payment that will receive the funds.',
    },
    {
      id: 'e-grant-quote',
      kind: 'request',
      source: 'client',
      target: 'auth',
      label: 'Grant (quote)',
      stepId: 'step-grant-quote',
      description:
        'The Client requests a non-interactive grant from the sender’s Auth Server for permission to create a quote.',
    },
    {
      id: 'e-quote',
      kind: 'request',
      source: 'client',
      target: 'resource',
      label: 'Create Quote',
      stepId: 'step-quote',
      description:
        'With the quote grant’s token, the Client asks the sender’s Resource Server to create a quote — a firm price for delivering the requested amount to the incoming-payment.',
    },
    {
      id: 'e-grant-out',
      kind: 'request',
      source: 'client',
      target: 'auth',
      label: 'Grant (outgoing)',
      stepId: 'step-grant-outgoing-interactive',
      description:
        'The Client requests a grant to create an outgoing-payment. Because this authorizes a real payment, the Auth Server requires interactive consent and replies with a redirect link instead of a token.',
    },
    {
      id: 'e-consent',
      kind: 'redirect',
      source: 'auth',
      target: 'client',
      label: 'interact.redirect',
      stepId: 'step-grant-outgoing-interactive',
      description:
        'The Auth Server sends back a redirect URL. The sender opens it, reviews the payment, and approves or declines it in their browser — the human-in-the-loop consent step.',
    },
    {
      id: 'e-grant-cont',
      kind: 'request',
      source: 'client',
      target: 'auth',
      label: 'Continue grant',
      stepId: 'step-grant-outgoing-continue',
      description:
        'After consent, the Client returns to the Auth Server with the interaction reference to "continue" the grant and finally collect the access token for the outgoing-payment.',
    },
    {
      id: 'e-op',
      kind: 'request',
      source: 'client',
      target: 'resource',
      label: 'Create Outgoing Payment',
      stepId: 'step-outgoing-payment',
      description:
        'Holding the consented token, the Client POSTs to the sender’s Resource Server to create the outgoing-payment instruction, referencing the quote and the incoming-payment as destination. The sender’s account-servicing entity then carries out the actual transfer.',
    },
    {
      id: 'e-create-ip',
      kind: 'creation',
      source: 'resource',
      target: 'incomingPayment',
      label: 'creates',
      description:
        'The incoming-payment resource is created and hosted on the receiver’s Resource Server. The Client’s "Create Incoming Payment" request lands here, and the server materialises the resource shown.',
    },
    {
      id: 'e-create-q',
      kind: 'creation',
      source: 'resource',
      target: 'quote',
      label: 'creates',
      description:
        'The quote resource is created and hosted on the sender’s Resource Server. The Client’s "Create Quote" request lands here, and the server materialises the firm price shown.',
    },
    {
      id: 'e-create-op',
      kind: 'creation',
      source: 'resource',
      target: 'outgoingPayment',
      label: 'creates',
      description:
        'The outgoing-payment resource is created and hosted on the sender’s Resource Server. The Client’s "Create Outgoing Payment" request lands here, and the server records the payment instruction. The actual money movement is performed separately by the sender’s account-servicing entity.',
    },
  ],
  steps: [
    {
      id: 'step-wallet-resolve',
      kind: 'wallet.resolve',
      title: 'Resolve wallet addresses',
      group: 'Discovery',
      involvedNodeIds: ['client', 'senderWallet', 'receiverWallet'],
      involvedEdgeIds: ['e-discovery-s', 'e-discovery-r'],
      description:
        'The Client fetches the public details of the Sender Wallet and Receiver Wallet to learn the Auth Server, Resource Server, and asset information it needs before doing anything else.',
      nodeRoles: {
        client:
          'The Client does the work here: it sends public GET requests to both wallet addresses to discover their servers and currency.',
        senderWallet:
          'The Sender Wallet is being looked up right now. Its public details reveal which Auth Server and Resource Server the sender uses, and in what currency.',
        receiverWallet:
          'The Receiver Wallet is being looked up so the Client learns where to create the incoming-payment and which servers the recipient trusts.',
      },
    },
    {
      id: 'step-grant-incoming',
      kind: 'grant.request',
      title: 'Grant for incoming payment',
      group: 'Incoming payment',
      involvedNodeIds: ['client', 'auth'],
      involvedEdgeIds: ['e-grant-in'],
      description:
        'The Client obtains a non-interactive grant from the receiver’s Auth Server that allows it to create an incoming-payment.',
      nodeRoles: {
        client:
          'The Client asks for permission, sending a signed grant request to the receiver’s Auth Server for the incoming-payment.',
        auth:
          'The receiver’s Auth Server reviews the request and, because no human approval is needed for receiving money, immediately issues an access token.',
      },
    },
    {
      id: 'step-incoming-payment',
      kind: 'incomingPayment.create',
      title: 'Create incoming payment',
      group: 'Incoming payment',
      involvedNodeIds: ['client', 'resource', 'incomingPayment'],
      involvedEdgeIds: ['e-ip', 'e-create-ip'],
      description:
        'The Client creates the incoming-payment resource on the receiver’s Resource Server and gets back its public details — this is the destination the payment will be directed to.',
      nodeRoles: {
        client:
          'The Client presents the token it just got and asks the receiver’s Resource Server to create the incoming-payment.',
        resource:
          'The receiver’s Resource Server checks the token and creates the incoming-payment resource on the recipient’s account.',
        incomingPayment:
          'The incoming-payment comes into existence here — the destination object that will receive the funds.',
      },
    },
    {
      id: 'step-grant-quote',
      kind: 'grant.request',
      title: 'Grant for quote',
      group: 'Quote',
      involvedNodeIds: ['client', 'auth'],
      involvedEdgeIds: ['e-grant-quote'],
      description:
        'The Client obtains a non-interactive grant from the sender’s Auth Server that allows it to create a quote.',
      nodeRoles: {
        client:
          'The Client requests permission from the sender’s Auth Server to create a quote (just pricing — not spending yet).',
        auth:
          'The sender’s Auth Server issues a non-interactive token for creating a quote, since asking for a price needs no human approval.',
      },
    },
    {
      id: 'step-quote',
      kind: 'quote.create',
      title: 'Create quote',
      group: 'Quote',
      involvedNodeIds: ['client', 'resource', 'quote'],
      involvedEdgeIds: ['e-quote', 'e-create-q'],
      description:
        'The Client creates the quote on the sender’s Resource Server, fixing the debit amount needed to deliver the payment to the incoming-payment.',
      nodeRoles: {
        client:
          'The Client uses the quote token to ask the sender’s Resource Server for a firm price for the transfer.',
        resource:
          'The sender’s Resource Server works out the cost (including any fees or conversion) and returns the quote.',
        quote:
          'The quote is created here, locking in exactly how much the sender will be debited.',
      },
    },
    {
      id: 'step-grant-outgoing-interactive',
      kind: 'grant.interactive_required',
      title: 'Interactive grant for outgoing payment',
      group: 'Outgoing payment',
      involvedNodeIds: ['client', 'auth'],
      involvedEdgeIds: ['e-grant-out', 'e-consent'],
      description:
        'The Client requests an interactive grant for the outgoing-payment. The Auth Server returns a redirect so the sender can consent to the payment.',
      nodeRoles: {
        client:
          'The Client requests permission to instruct a real payment. Authorizing it requires the sender’s consent, so it cannot get a token straight away.',
        auth:
          'Because a real payment is being authorized, the sender’s Auth Server refuses to auto-approve and instead returns a redirect URL for the sender to consent.',
      },
    },
    {
      id: 'step-grant-outgoing-continue',
      kind: 'grant.continue',
      title: 'Continue grant after consent',
      group: 'Outgoing payment',
      involvedNodeIds: ['client', 'auth'],
      involvedEdgeIds: ['e-grant-cont'],
      description:
        'After the sender approves, the Client continues the grant with the Auth Server to obtain the access token for creating the outgoing-payment.',
      nodeRoles: {
        client:
          'After consent, the Client returns to the Auth Server with the interaction reference to finish the grant and collect its access token.',
        auth:
          'The Auth Server verifies that consent was completed and issues the final access token for the outgoing-payment.',
      },
    },
    {
      id: 'step-outgoing-payment',
      kind: 'outgoingPayment.create',
      title: 'Create outgoing payment',
      group: 'Outgoing payment',
      involvedNodeIds: ['client', 'resource', 'outgoingPayment'],
      involvedEdgeIds: ['e-op', 'e-create-op'],
      description:
        'The Client creates the outgoing-payment on the sender’s Resource Server, recording the instruction to pay — referencing the quote and the incoming-payment as the destination. The sender’s account-servicing entity then settles the transfer out of band.',
      nodeRoles: {
        client:
          'The Client presents the consented token and asks the sender’s Resource Server to create the outgoing-payment instruction.',
        resource:
          'The sender’s Resource Server records the outgoing-payment instruction against the quote; its account-servicing entity performs the actual transfer afterwards.',
        outgoingPayment:
          'The outgoing-payment instruction is created here. Money leaves the Sender Wallet only when the account-servicing entity acts on it — not at creation time.',
      },
    },
  ],
}
