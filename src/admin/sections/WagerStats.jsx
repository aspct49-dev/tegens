import { useEffect, useMemo, useRef, useState } from 'react'
import { getPeriod } from '../../config'
import { apiGet } from '../api'
import { Button, Card, Empty, ErrorLine, Input, SectionIntro, Select, Stat } from '../ui'
import './wager-admin.css'

// Wager stats: how much players wagered under the code in any past time frame, from the
// Rainbet affiliate API (server/features/wagerStats.js). Totals, a chart over time, and every
// player (full names) - click one to see their own chart.

const API = '/api/admin/wager-stats'
const DAY = 86_400_000
const iso = (t) => new Date(t).toISOString().slice(0, 10)
const today = () => iso(Date.now())
const minus = (days) => iso(Date.now() - days * DAY)

// chart colours, validated for this surface (#13212b): blue = everyone, gold = one player
const C_ALL = '#2a91d5'
const C_ONE = '#b97f10'

const usd = (n, d = 0) => `$${(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}`
const short = (n) =>
  n >= 1e6 ? `$${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}k` : `$${Math.round(n)}`
const pct = (x) => `${(x * 100).toFixed(1)}%`
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const dLabel = (s) => {
  const d = new Date(`${s}T00:00:00Z`)
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
}
const bucketLabel = (b, kind) => {
  if (kind === 'month') {
    const d = new Date(`${b.start}T00:00:00Z`)
    return `${MONTHS[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`
  }
  return dLabel(b.start)
}
const bucketRange = (b, kind) => (kind === 'day' || b.start === b.end ? dLabel(b.start) : `${dLabel(b.start)} – ${dLabel(b.end)}`)

function presets() {
  const p = getPeriod()
  const ps = new Date(`${p.startAt}T00:00:00Z`)
  const prevStart = iso(Date.UTC(ps.getUTCFullYear(), ps.getUTCMonth() - 1, ps.getUTCDate()))
  const prevEnd = iso(ps.getTime() - DAY)
  const y = new Date().getUTCFullYear()
  return [
    { id: 'period', label: 'This leaderboard', start: p.startAt, end: p.endAt < today() ? p.endAt : today() },
    { id: 'prev', label: 'Last leaderboard', start: prevStart, end: prevEnd },
    { id: '7', label: 'Last 7 days', start: minus(6), end: today() },
    { id: '30', label: 'Last 30 days', start: minus(29), end: today() },
    { id: '90', label: 'Last 90 days', start: minus(89), end: today() },
    { id: 'year', label: `${y} so far`, start: `${y}-01-01`, end: today() },
  ]
}

export default function WagerStatsAdmin() {
  const PRESETS = useMemo(presets, [])
  const [preset, setPreset] = useState('period')
  const [range, setRange] = useState({ start: PRESETS[0].start, end: PRESETS[0].end })
  const [bucket, setBucket] = useState('auto')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState(null) // a player's name
  const [all, setAll] = useState(false)
  const [asTable, setAsTable] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    const b = bucket === 'auto' ? '' : `&bucket=${bucket}`
    apiGet(`${API}?start=${range.start}&end=${range.end}${b}`)
      .then((d) => !cancelled && setData(d))
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [range.start, range.end, bucket])

  const choose = (p) => {
    setPreset(p.id)
    setRange({ start: p.start, end: p.end })
  }

  const t = data?.totals
  const change = t?.previous && t.previous.wagered > 0 ? t.wagered / t.previous.wagered - 1 : null
  const players = useMemo(() => {
    if (!data) return []
    const needle = q.trim().toLowerCase()
    return data.players.map((p, i) => ({ ...p, rank: i + 1 })).filter((p) => !needle || p.name.toLowerCase().includes(needle))
  }, [data, q])
  const one = picked && data ? data.players.find((p) => p.name === picked) : null

  return (
    <>
      <SectionIntro>
        How much players wagered under the code in any time frame, straight from Rainbet. Pick a range; click a player for their own chart.
      </SectionIntro>

      <div className="ws-filters" role="group" aria-label="Time frame">
        {PRESETS.map((p) => (
          <button key={p.id} className={`ws-chip${preset === p.id ? ' is-on' : ''}`} onClick={() => choose(p)} aria-pressed={preset === p.id}>
            {p.label}
          </button>
        ))}
        <span className="ws-dates">
          <input
            type="date"
            value={range.start}
            max={range.end}
            onChange={(e) => {
              setPreset('custom')
              setRange((r) => ({ ...r, start: e.target.value }))
            }}
            aria-label="From"
          />
          <span aria-hidden="true">–</span>
          <input
            type="date"
            value={range.end}
            min={range.start}
            max={today()}
            onChange={(e) => {
              setPreset('custom')
              setRange((r) => ({ ...r, end: e.target.value }))
            }}
            aria-label="To"
          />
        </span>
        <Select
          value={bucket}
          onChange={setBucket}
          options={[
            { value: 'auto', label: 'Group: auto' },
            { value: 'day', label: 'By day' },
            { value: 'week', label: 'By week' },
            { value: 'month', label: 'By month' },
          ]}
        />
      </div>

      <ErrorLine>{error}</ErrorLine>
      {!data && loading && <span className="adm-spin adm-spin-inline" aria-label="Loading" />}

      {data && (
        <div className={`ws-body${loading ? ' is-loading' : ''}`} aria-busy={loading}>
          <div className="ws-stats">
            <div className="adm-stat is-blue ws-hero">
              <span className="adm-stat-label">Wagered</span>
              <span className="adm-stat-value">{usd(t.wagered)}</span>
              {change != null && (
                <span className={`ws-change${change >= 0 ? ' is-up' : ' is-down'}`}>
                  {change >= 0 ? '▲' : '▼'} {pct(Math.abs(change))} vs the {t.previous && Math.round((Date.parse(t.previous.end) - Date.parse(t.previous.start)) / DAY) + 1} days before
                </span>
              )}
            </div>
            <Stat label="Players" value={t.players.toLocaleString('en-US')} />
            <Stat label="Average" value={usd(t.avg)} />
            <Stat label="Median" value={usd(t.median)} />
            <Stat label="Top 10 share" value={pct(t.top10Share)} />
          </div>

          <Card
            title={`Wagered ${data.bucket === 'day' ? 'per day' : data.bucket === 'week' ? 'per week' : 'per month'} · ${dLabel(data.start)} – ${dLabel(data.end)}`}
            actions={<Button onClick={() => setAsTable((v) => !v)}>{asTable ? 'Show chart' : 'Show as table'}</Button>}
          >
            {asTable ? (
              <BucketTable buckets={data.buckets} kind={data.bucket} />
            ) : (
              <BarChart buckets={data.buckets} kind={data.bucket} values={data.buckets.map((b) => b.total)} color={C_ALL} extra={(b) => `${b.players} players`} />
            )}
          </Card>

          {one && (
            <Card
              title={`${one.name} · ${usd(one.wagered)} (${pct(one.share)} of the total)`}
              actions={<Button onClick={() => setPicked(null)}>Close</Button>}
              className="ws-one"
            >
              <BarChart buckets={data.buckets} kind={data.bucket} values={one.series} color={C_ONE} />
            </Card>
          )}

          <Card title={`Players (${data.players.length.toLocaleString('en-US')})`} actions={<Input value={q} onChange={setQ} placeholder="Search a name…" type="search" aria-label="Search players" />}>
            {players.length === 0 ? (
              <Empty>{q ? 'Nobody matches that name.' : 'Nobody wagered in this time frame.'}</Empty>
            ) : (
              <>
                <table className="adm-table ws-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Rainbet name</th>
                      <th className="is-num">Wagered</th>
                      <th className="is-num">Share</th>
                      <th aria-label="Trend" />
                    </tr>
                  </thead>
                  <tbody>
                    {(all ? players : players.slice(0, 50)).map((p) => (
                      <tr key={p.name} className={picked === p.name ? 'is-picked' : ''}>
                        <td className="ws-rank">{p.rank}</td>
                        <td>
                          <button className="ws-name" onClick={() => setPicked(picked === p.name ? null : p.name)}>
                            {p.name}
                          </button>
                        </td>
                        <td className="is-num">{usd(p.wagered, 2)}</td>
                        <td className="is-num">{pct(p.share)}</td>
                        <td className="ws-spark-cell">
                          <Spark values={p.series} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!all && players.length > 50 && (
                  <Button onClick={() => setAll(true)}>Show all {players.length.toLocaleString('en-US')}</Button>
                )}
              </>
            )}
          </Card>
        </div>
      )}
    </>
  )
}

// ---------------------------------------------------------------- chart pieces

const W = 760
const H = 220
const PAD = { l: 52, r: 8, t: 10, b: 26 }

function niceMax(v) {
  if (v <= 0) return 1
  const p = 10 ** Math.floor(Math.log10(v))
  const m = v / p
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p
}

/** One series of bars over the buckets: recessive grid, 4px rounded tops, a hover tooltip */
function BarChart({ buckets, kind, values, color, extra }) {
  const [hover, setHover] = useState(null)
  const wrap = useRef(null)
  const n = values.length
  const max = niceMax(Math.max(...values, 0))
  const iw = W - PAD.l - PAD.r
  const ih = H - PAD.t - PAD.b
  const slot = iw / n
  const gap = Math.min(2 + slot * 0.18, 10)
  const bw = Math.max(1, slot - gap)
  const y = (v) => PAD.t + ih - (v / max) * ih
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max)
  const every = Math.ceil(n / 8) // at most ~8 x labels

  return (
    <div className="ws-chart" ref={wrap} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Bar chart of wager ${kind === 'day' ? 'per day' : kind === 'week' ? 'per week' : 'per month'}`}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} className={v === 0 ? 'ws-base' : 'ws-grid'} />
            <text x={PAD.l - 8} y={y(v) + 4} className="ws-axis" textAnchor="end">
              {short(v)}
            </text>
          </g>
        ))}
        {values.map((v, i) => {
          const x = PAD.l + i * slot + gap / 2
          const top = y(v)
          const h = PAD.t + ih - top
          const r = Math.min(4, bw / 2, h)
          return (
            <g key={i}>
              {h > 0.5 && (
                <path
                  d={`M${x},${PAD.t + ih} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${PAD.t + ih} Z`}
                  fill={color}
                  opacity={hover == null || hover === i ? 1 : 0.55}
                />
              )}
              {i % every === 0 && (
                <text x={x + bw / 2} y={H - 8} className="ws-axis" textAnchor="middle">
                  {bucketLabel(buckets[i], kind)}
                </text>
              )}
              {/* hit target: the full column, wider than the bar */}
              <rect x={PAD.l + i * slot} y={PAD.t} width={slot} height={ih} fill="transparent" onMouseEnter={() => setHover(i)} />
            </g>
          )
        })}
      </svg>
      {hover != null && (
        <div className="ws-tip" style={{ left: `${((PAD.l + (hover + 0.5) * slot) / W) * 100}%` }}>
          <span className="ws-tip-date">{bucketRange(buckets[hover], kind)}</span>
          <span className="ws-tip-value">
            <i style={{ background: color }} aria-hidden="true" />
            {usd(values[hover], 2)}
          </span>
          {extra && <span className="ws-tip-extra">{extra(buckets[hover])}</span>}
        </div>
      )}
    </div>
  )
}

/** Tiny trend line for a table row (no axes: shape only) */
function Spark({ values }) {
  const w = 90
  const h = 22
  const max = Math.max(...values, 0)
  if (!max) return null
  const pts = values.map((v, i) => `${((i + 0.5) / values.length) * w},${h - 2 - (v / max) * (h - 4)}`).join(' ')
  return (
    <svg className="ws-spark" viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <polyline points={pts} fill="none" stroke={C_ALL} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

function BucketTable({ buckets, kind }) {
  return (
    <table className="adm-table ws-table">
      <thead>
        <tr>
          <th>{kind === 'day' ? 'Day' : kind === 'week' ? 'Week' : 'Month'}</th>
          <th className="is-num">Wagered</th>
          <th className="is-num">Players</th>
        </tr>
      </thead>
      <tbody>
        {buckets.map((b) => (
          <tr key={b.start}>
            <td>{bucketRange(b, kind)}</td>
            <td className="is-num">{usd(b.total, 2)}</td>
            <td className="is-num">{b.players}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
