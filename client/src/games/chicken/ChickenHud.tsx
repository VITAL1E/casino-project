// HUD of Chicken Royale: shrink progress, leaderboard, kill feed, minimap, hearts, golden egg counter, countdown and
// status banners. All numbers arrive from the 3D loop (api.ui) a few times a second.
import { MAX_HP, R_END, R_START } from './engine'

export type FeedItem = { id: number; text: string; mine: boolean }
export type ChickenUi = {
  t: number; alive: number; total: number; kills: number; hp: number; gold: number; me: boolean; place: number
  radius: number; board: { name: string; hp: number; kills: number; me: boolean; alive: boolean }[]
  feed: FeedItem[]; hitmark: boolean; muted: boolean; locked: boolean; leader: string
}

type Props = { ui: ChickenUi | null; begin: number; timeLeft: number; pool: number }

const ChickenHud = ({ ui, begin, timeLeft, pool }: Props) => {
  if (!ui) return null
  const shrink = Math.max(0, Math.min(1, (R_START - ui.radius) / (R_START - R_END)))
  const danger = shrink > 0.7
  return (
    <>
      <div className="sl-hud sl-hud--tl">
        <div className="sl-chip"><span>Time</span><b>{timeLeft}s</b></div>
        <div className="sl-chip"><span>Alive</span><b>{ui.alive}/{ui.total}</b></div>
        <div className="sl-chip"><span>Kills</span><b>{ui.kills}</b></div>
        <div className="sl-chip"><span>Pool</span><b>{pool.toFixed(2)}</b></div>
      </div>

      <div className={`ck-zone${danger ? ' ck-zone--danger' : ''}`}>
        <span>Island {Math.round(ui.radius)}m</span>
        <div className="ck-zone-bar"><i style={{ width: `${(1 - shrink) * 100}%` }} /></div>
      </div>

      <div className="ck-right">
        <div className="ck-board">
          {ui.board.map(b => (
            <div key={b.name} className={`ck-row${b.me ? ' ck-row--me' : ''}${b.alive ? '' : ' ck-row--dead'}`}>
              <span>{b.name === ui.leader && b.alive ? '\u{1F451} ' : ''}{b.name}</span>
              <b>{'♥'.repeat(Math.max(0, b.hp))}</b>
            </div>
          ))}
        </div>
        <div className="ck-feed">
          {ui.feed.map(f => <div key={f.id} className={f.mine ? 'ck-feed--mine' : ''}>{f.text}</div>)}
        </div>
      </div>


      <div className="ck-bottom">
        <div className="ck-hearts" aria-label={`Health ${ui.hp} of ${MAX_HP}`}>
          {Array.from({ length: MAX_HP }, (_, i) => <span key={i} className={i < ui.hp ? (ui.hp <= 2 ? 'on low' : 'on') : ''}>{'♥'}</span>)}
        </div>
        {ui.gold > 0 && <div className="ck-gold">{'\u{1F95A}'} Golden eggs x{ui.gold}</div>}
        <small>{ui.me ? 'WASD move · Mouse aim · Click / Space throw · M sound' : `Eliminated${ui.place ? ` — #${ui.place}` : ''} · spectating`}</small>
      </div>

      {ui.hitmark && <div className="ck-hitmark" />}
      <div className="ck-sound">{ui.muted ? 'Sound off (M)' : ''}</div>

      {begin > 0 && <div className="ck-count" key={begin}>{begin}</div>}
      {begin === 0 && ui.t < 1.4 && <div className="ck-count ck-count--go">GO!</div>}
    </>
  )
}

export default ChickenHud
