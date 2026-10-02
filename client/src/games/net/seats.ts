// Random seat assignment shared by every arcade engine: `humans` real players get
// random entity ids out of `players`, the rest are bots.
export const pickSeats = (humans: number, players: number): number[] => {
  const order = Array.from({ length: players }, (_, i) => i)
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]]
  }
  return order.slice(0, humans)
}
