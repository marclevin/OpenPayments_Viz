import type { FlowExecutionSpec } from '@opviz/shared'
import { paramCapabilities, type ScenarioParams } from '../lib/scenarioParams'

// Marks a field the user can't change, with a tooltip explaining why.
function NotEditable({ reason }: { reason: string }) {
  return (
    <span className="paramLock" title={reason}>
      🔒 not editable
    </span>
  )
}

// A read-only value, visually distinct from inputs, with an explicit reason it can't be edited.
function ReadOnlyField({ label, value, reason }: { label: string; value: string; reason: string }) {
  return (
    <div className="field">
      <label>
        {label} <NotEditable reason={reason} />
      </label>
      <div className="paramReadonly">{value}</div>
      <div className="subtleHelp">{reason}</div>
    </div>
  )
}

// Edits the parameters of an existing scenario (amount, fixed-send/receive, currency, recurrence,
// split shares). Anything the user can't change in the current context — sides fixed by the scenario,
// or currency/FX on TestNet (set by the wallet) — is shown read-only and explicitly marked, so it's
// clear what's adjustable. Changes flow up via onChange and rebuild the effective spec.
export function ParameterEditor({
  spec,
  params,
  onChange,
  onReset,
  transport,
  disabled,
}: {
  spec: FlowExecutionSpec
  params: ScenarioParams
  onChange: (p: ScenarioParams) => void
  onReset: () => void
  transport: 'mock' | 'sse'
  disabled?: boolean
}) {
  const caps = paramCapabilities(spec)
  const set = (patch: Partial<ScenarioParams>) => onChange({ ...params, ...patch })
  const currencyLocked = transport === 'sse'
  const fixedSend = params.amountMode === 'fixed-send'
  const amountLabel = fixedSend ? 'Sender pays (fixed)' : 'Receiver gets (fixed)'
  const walletRole = fixedSend ? 'sending' : 'receiving'

  return (
    <fieldset className="paramEditor" disabled={disabled}>
      <p className="hint">
        Adjust this scenario’s parameters, then press <strong>Start</strong>. Fields marked
        “🔒 not editable” are fixed by the scenario itself or, on TestNet, set by the wallet.
      </p>
      {disabled ? (
        <div className="paramBanner">Parameters are locked while a run is in progress — stop the run to edit.</div>
      ) : null}

      {/* --- Payment type --- */}
      <div className="paramSection">
        <div className="paramSectionTitle">Payment type</div>
        {caps.mode ? (
          <div className="field">
            <label>Which side is fixed?</label>
            <div className="paramRadios">
              <label className="paramRadio">
                <input
                  type="radio"
                  name="amountMode"
                  checked={fixedSend}
                  onChange={() => set({ amountMode: 'fixed-send' })}
                />
                Sender pays a fixed amount
              </label>
              <label className="paramRadio">
                <input
                  type="radio"
                  name="amountMode"
                  checked={!fixedSend}
                  onChange={() => set({ amountMode: 'fixed-receive' })}
                />
                Receiver gets a fixed amount
              </label>
            </div>
            <div className="subtleHelp">The other side is then derived by the quote (after FX + fees).</div>
          </div>
        ) : (
          <ReadOnlyField
            label="Which side is fixed?"
            value={fixedSend ? 'Fixed send — the sender pays a set amount' : 'Fixed receive — the receiver gets a set amount'}
            reason={
              caps.split
                ? 'This split scenario always fixes each recipient’s received amount.'
                : 'This scenario always fixes the receive side.'
            }
          />
        )}
      </div>

      {/* --- Amount(s) --- */}
      <div className="paramSection">
        <div className="paramSectionTitle">{caps.split ? 'Recipient amounts' : 'Amount'}</div>
        {caps.split ? (
          params.recipients.map((r, i) => (
            <div className="paramRow" key={r.key}>
              <span className="paramRowLabel">{r.label} gets</span>
              <div className="paramAmountRow">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={r.amountMajor}
                  onChange={(e) => {
                    const recipients = params.recipients.map((x, xi) =>
                      xi === i ? { ...x, amountMajor: e.target.value } : x
                    )
                    set({ recipients })
                  }}
                />
                {!currencyLocked ? <span className="paramAddon">{params.fixedAssetCode}</span> : null}
              </div>
            </div>
          ))
        ) : (
          <div className="field">
            <label>{amountLabel}</label>
            <div className="paramAmountRow">
              <input
                type="number"
                min="0"
                step="0.01"
                value={params.amountMajor}
                onChange={(e) => set({ amountMajor: e.target.value })}
              />
              {!currencyLocked ? <span className="paramAddon">{params.fixedAssetCode}</span> : null}
            </div>
            {currencyLocked ? (
              <div className="subtleHelp">Amount is in the {walletRole} wallet’s own currency.</div>
            ) : null}
          </div>
        )}
      </div>

      {/* --- Currency & conversion --- */}
      {caps.currency ? (
        <div className="paramSection">
          <div className="paramSectionTitle">Currency &amp; conversion</div>
          {currencyLocked ? (
            <ReadOnlyField
              label="Currencies & FX"
              value="Determined by the wallets and the live quote"
              reason="On TestNet each wallet declares its own currency and the real quote sets the exchange rate. Switch to Mocked mode to explore different currencies and rates."
            />
          ) : caps.split ? (
            <div className="field">
              <label>Currency (all recipients)</label>
              <input value={params.fixedAssetCode} onChange={(e) => set({ fixedAssetCode: e.target.value.toUpperCase() })} />
            </div>
          ) : (
            <>
              <div className="grid2">
                <div className="field">
                  <label>{fixedSend ? 'Sender currency' : 'Receiver currency'}</label>
                  <input value={params.fixedAssetCode} onChange={(e) => set({ fixedAssetCode: e.target.value.toUpperCase() })} />
                </div>
                <div className="field">
                  <label>{fixedSend ? 'Receiver currency' : 'Sender currency'}</label>
                  <input
                    value={params.counterpartyAssetCode}
                    onChange={(e) => set({ counterpartyAssetCode: e.target.value.toUpperCase() })}
                  />
                </div>
              </div>
              <div className="field">
                <label>Illustrative exchange rate</label>
                <div className="paramAmountRow">
                  <span className="paramAddon">1 {params.fixedAssetCode} =</span>
                  <input type="number" min="0" step="0.0001" value={params.fxRate} onChange={(e) => set({ fxRate: e.target.value })} />
                  <span className="paramAddon">{params.counterpartyAssetCode}</span>
                </div>
                <div className="subtleHelp">Used only for the “≈” estimate in Mocked mode — a real run uses the live quote.</div>
              </div>
            </>
          )}
        </div>
      ) : null}

      {/* --- Recurrence --- */}
      {caps.recurrence ? (
        <div className="paramSection">
          <div className="paramSectionTitle">Recurrence</div>
          <div className="field">
            <label>Number of payments</label>
            <input
              type="number"
              min="1"
              step="1"
              value={params.recurrenceCount}
              onChange={(e) => set({ recurrenceCount: e.target.value })}
            />
            <div className="subtleHelp">One consent authorizes this many repeated payments on the recurring grant.</div>
          </div>
        </div>
      ) : null}

      <button type="button" className="btn" onClick={onReset}>
        Reset to defaults
      </button>
    </fieldset>
  )
}
