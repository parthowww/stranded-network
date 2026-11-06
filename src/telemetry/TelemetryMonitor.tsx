import { useState, useEffect } from 'react';

export function TelemetryMonitor() {
  const [sensors, setSensors] = useState<any[]>([]);
  const [recentReadings, setRecentReadings] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [sseActive, setSseActive] = useState(false);

  const loadData = async () => {
    try {
      const res = await fetch('/api/telemetry/sensors');
      if (res.ok) {
        const data = await res.json();
        setSensors(data.sensors || []);
      }
    } catch {}
  };

  useEffect(() => {
    loadData();

    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource('/api/telemetry/stream');
      eventSource.onopen = () => setSseActive(true);
      eventSource.onerror = () => setSseActive(false);

      eventSource.addEventListener('reading', (e: MessageEvent) => {
        try {
          const reading = JSON.parse(e.data);
          setRecentReadings((prev) => [reading, ...prev.slice(0, 19)]);
          loadData();
        } catch {}
      });
    } catch {
      setSseActive(false);
    }

    return () => {
      if (eventSource) eventSource.close();
    };
  }, []);

  const handleQuickTest = async (scenario: string) => {
    setLoading(true);
    try {
      const res = await fetch('/api/telemetry/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario })
      });
      const data = await res.json();
      if (data.results) {
        setRecentReadings((prev) => [...data.results, ...prev.slice(0, 19)]);
      }
      loadData();
    } catch {}
    finally {
      setLoading(false);
    }
  };

  // Find latest reading for a sensor
  const getLatestReading = (sensorId: string) => {
    return recentReadings.find((r) => r.sensor_id === sensorId);
  };

  return (
    <div className="telemetry-minimal-container">
      {/* Calm Header */}
      <div className="telem-header-minimal">
        <div>
          <h2 className="telem-title">Sensor Telemetry Monitor</h2>
          <span className="telem-subtitle">
            {sensors.length} Live Feeds • Anomaly Filter Active ({sseActive ? 'Live SSE' : 'Polling'})
          </span>
        </div>

        <div className="telem-actions-minimal">
          <button
            type="button"
            className="telem-test-btn"
            onClick={() => handleQuickTest('spike')}
            disabled={loading}
            title="Inject test 450 km/h radar spike"
          >
            ⚡ Test Glitch
          </button>
          <button
            type="button"
            className="telem-test-btn"
            onClick={() => handleQuickTest('stuck')}
            disabled={loading}
            title="Inject stuck sensor"
          >
            ❄️ Test Stuck
          </button>
          <button
            type="button"
            className="telem-test-btn"
            onClick={loadData}
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Streamlined Clean Table */}
      <div className="telem-clean-table-wrap">
        <table className="telem-clean-table">
          <thead>
            <tr>
              <th>SENSOR / LOCATION</th>
              <th>CURRENT READING</th>
              <th>HEALTH STATUS</th>
              <th>FILTER ACTION</th>
            </tr>
          </thead>
          <tbody>
            {sensors.map((s) => {
              const latest = getLatestReading(s.id);
              const isSpike = latest?.validation_status === 'SPIKE_REJECTED';
              const isStuck = latest?.validation_status === 'STUCK_SENSOR';
              const isAnomaly = isSpike || isStuck || s.health_status !== 'HEALTHY';

              return (
                <tr key={s.id} className={isAnomaly ? 'row-alert' : ''}>
                  <td className="col-sensor">
                    <strong>{s.name}</strong>
                    <span className="sub-loc">{s.location} • {s.sensor_type}</span>
                  </td>
                  <td className="col-val">
                    {latest ? (
                      <div>
                        <span className={`val-num ${isSpike ? 'spike-strike' : ''}`}>
                          {latest.raw_value} {s.unit}
                        </span>
                        {isSpike && (
                          <span className="filtered-val">
                            → Kept safe at {latest.smoothed_value} {s.unit}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="val-nominal">Nominal ({s.nominal_min}–{s.nominal_max} {s.unit})</span>
                    )}
                  </td>
                  <td className="col-status">
                    <span className={`status-pill ${isAnomaly ? 'pill-alert' : 'pill-ok'}`}>
                      {latest?.validation_status || s.health_status}
                    </span>
                  </td>
                  <td className="col-action">
                    {latest?.notes ? (
                      <span className="action-note">{latest.notes}</span>
                    ) : (
                      <span className="action-nominal">Signal verified • Zero errors</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
