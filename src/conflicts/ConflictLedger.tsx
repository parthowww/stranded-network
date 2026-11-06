import { useState, useEffect } from 'react';

export function ConflictLedger() {
  const [ledger, setLedger] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchLedger = async () => {
    try {
      const res = await fetch('/api/conflicts/ledger');
      if (res.ok) {
        const data = await res.json();
        setLedger(data.ledger || []);
      }
    } catch {}
  };

  useEffect(() => {
    fetchLedger();
  }, []);

  const handleQuickTest = async (scenario: string) => {
    setLoading(true);
    try {
      const res = await fetch('/api/conflicts/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario })
      });
      const data = await res.json();
      if (data.result) {
        setLedger((prev) => [data.result, ...prev]);
      }
    } catch {}
    finally {
      setLoading(false);
    }
  };

  return (
    <div className="conflict-minimal-container">
      {/* Calm Header */}
      <div className="conflict-header-minimal">
        <div>
          <h2 className="conflict-title">Truth Arbitration Ledger</h2>
          <span className="conflict-subtitle">
            Resolves conflicting reports without blindly trusting the newest arrival (Anti-LWW)
          </span>
        </div>

        <div className="conflict-actions-minimal">
          <button
            type="button"
            className="telem-test-btn special"
            onClick={() => handleQuickTest('stale_new_arrival')}
            disabled={loading}
            title="Simulate 45m old report arriving late"
          >
            🛡️ Test Stale Replay
          </button>
          <button
            type="button"
            className="telem-test-btn"
            onClick={() => handleQuickTest('close_call_quarantine')}
            disabled={loading}
            title="Simulate 50-50 ambiguous tie"
          >
            ⚠️ Test 50-50 Tie
          </button>
        </div>
      </div>

      {/* Simplified Conflict List */}
      <div className="conflict-simple-list">
        {ledger.length === 0 ? (
          <div className="conflict-empty">
            <p>No conflicting reports received yet. All station feeds are in agreement.</p>
          </div>
        ) : (
          ledger.map((conf) => {
            const isQuarantined = conf.resolution_status === 'CONFLICT_QUARANTINED';
            const winner = conf.winner_source;
            const winnerVal = typeof conf.winner_value === 'object' 
              ? (conf.winner_value?.is_closed ? 'CLOSED' : 'OPEN')
              : String(conf.winner_value || 'UNKNOWN');

            return (
              <div key={conf.conflict_id} className={`conflict-simple-item ${isQuarantined ? 'item-quarantine' : ''}`}>
                <div className="item-top">
                  <span className="item-entity">{conf.entity_id} • {conf.attribute.toUpperCase()}</span>
                  <span className={`item-badge ${isQuarantined ? 'badge-warn' : 'badge-ok'}`}>
                    {isQuarantined ? 'HOLD FOR SAFETY' : 'TRUTH VERIFIED'}
                  </span>
                </div>

                <div className="item-decision">
                  <strong>Confirmed Status: {isQuarantined ? 'QUARANTINED (Conservative Policy)' : winnerVal}</strong>
                  <p className="item-rationale">{conf.rationale}</p>
                </div>

                <div className="item-sources-flow">
                  {conf.competing_records?.map((c: any, i: number) => {
                    const isAccepted = !isQuarantined && c.record.source_name === winner;
                    return (
                      <div key={i} className={`source-pill ${isAccepted ? 'accepted' : 'rejected'}`}>
                        <span className="source-mark">{isAccepted ? '✓ ACCEPTED' : c.is_stale ? '✕ STALE' : '✕ REJECTED'}:</span>
                        <span className="source-name">{c.record.source_name}</span>
                        <span className="source-meta">
                          ({c.event_age_seconds}s old • Rank #{c.arrival_rank})
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
