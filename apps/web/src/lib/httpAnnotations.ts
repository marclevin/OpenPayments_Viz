// Plain-English explanations for common Open Payments / GNAP JSON fields.
// Shown as inline chips when the "Annotate fields" toggle is on in the HTTP detail view.
export const HTTP_ANNOTATIONS: Record<string, string> = {
  walletAddress: 'The Open Payments wallet address URL that owns this resource',
  incomingAmount: 'Fixed amount the receiver expects (value in smallest units, e.g. cents)',
  debitAmount: 'Amount debited from the sender\'s account',
  receiveAmount: 'Amount credited to the receiver\'s account',
  receiver: 'URL of the incoming payment this quote is targeting',
  quoteId: 'URL of the pre-computed quote that authorises this payment',
  access: 'Array of access rights being requested in this GNAP grant',
  type: 'Resource type: incoming-payment, quote, or outgoing-payment',
  actions: 'Permitted operations on this resource: create, read, complete',
  identifier: 'Wallet address that scopes this grant\'s access rights',
  interact: 'How the user will give consent (redirect to a hosted UI)',
  method: 'Payment rail — currently only "ilp" (Interledger Protocol)',
  metadata: 'Free-form note attached to the payment (not used for routing)',
  completed: 'True once the incoming payment has received its full amount',
  failed: 'True if the outgoing payment attempt was unsuccessful',
  expiresAt: 'ISO 8601 timestamp after which this resource is no longer valid',
  value: 'Amount in the asset\'s smallest unit (e.g. 100 = $1.00 at scale 2)',
  assetCode: 'ISO 4217 currency code (e.g. USD, EUR)',
  assetScale: 'Decimal places — divide value by 10^assetScale to get the display amount',
}
