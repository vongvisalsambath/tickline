// Demo only: practice positions drawn with Tickline's public overlay API (markers, price lines, zones, time lines).
// No trading happens here; it shows how an app can put its own positions on the chart.

export function createPositions(chart, { getPrice, payout = 0.85, onChange = () => {} }) {
  const open = new Map();
  let seq = 0;
  const UP = "#22c38e", DOWN = "#f0506e";

  function place(side, amount, durationMs) {
    const now = Date.now(), price = getPrice();
    const end = now + durationMs;
    const color = side === "up" ? UP : DOWN;
    const id = ++seq;
    const ids = {
      zone: chart.addZone(side === "up"
        ? { from: "top", to: price, color: "rgba(34,195,142,0.07)", start: now, end }
        : { from: price, to: "bottom", color: "rgba(240,80,110,0.07)", start: now, end }),
      line: chart.addPriceLine({ price, color, from: now, to: end, style: "solid", axisLabel: false }),
      expiry: chart.addTimeLine({ time: end, countdown: true, color: "#e6e9ef", style: "dashed" }),
      marker: chart.addMarker({ time: now, price, side: side === "up" ? "buy" : "sell", text: `$${amount}` }),
    };
    open.set(id, { id, side, amount, price, start: now, end, ids });
    refresh();
    return id;
  }

  function result(p, price) {
    const win = p.side === "up" ? price > p.price : price < p.price;
    return win ? +(p.amount * payout).toFixed(2) : -p.amount;
  }

  function refresh() {
    const price = getPrice(), now = Date.now();
    let total = 0;
    for (const p of [...open.values()]) {
      const pl = result(p, price);
      if (now >= p.end) {
        Object.values(p.ids).forEach((x) => chart.removeOverlay(x));
        const done = chart.addMarker({ time: p.end, price, side: "neutral", color: pl > 0 ? UP : "#7d8799", text: pl > 0 ? `+$${pl.toFixed(2)}` : `−$${p.amount}` });
        setTimeout(() => chart.removeOverlay(done), 6000);
        open.delete(p.id);
        continue;
      }
      total += pl;
      chart.updateOverlay(p.ids.marker, { text: `$${p.amount} · ${pl > 0 ? "+" : "−"}$${Math.abs(pl).toFixed(2)}` });
    }
    onChange({ count: open.size, expected: +total.toFixed(2) });
  }

  const timer = setInterval(refresh, 250);
  return { place, refresh, stop: () => clearInterval(timer), get open() { return [...open.values()]; } };
}
