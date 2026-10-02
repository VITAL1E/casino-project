import type { Server } from 'node:http'
import { attachArcade } from './lobby'
import { slitherEngine } from './games/slither'
import { agarEngine } from './games/agar'
import { holeEngine } from './games/hole'
import { paperEngine } from './games/paper'
import { chickenEngine } from './games/chicken'
import { stormEngine } from './games/storm'
import { flappyEngine } from './games/flappy'
import { roadcrossEngine } from './games/roadcross'
import { crashEngine } from './games/crash'

// Every server-authoritative arcade game plugs in here (see ./engine.ts).
export const engines = [slitherEngine, agarEngine, holeEngine, paperEngine, chickenEngine, stormEngine]
// Single-player sessions: one player, no bots (see ./solo.ts).
export const soloEngines = [flappyEngine, roadcrossEngine, crashEngine]

export const startArcade = (server: Server, allowedOrigin: string) => attachArcade(server, allowedOrigin, engines, soloEngines)
