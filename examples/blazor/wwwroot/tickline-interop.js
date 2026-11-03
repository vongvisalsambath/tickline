// Small bridge between Blazor and <trade-chart>. Load after tickline.umd.js.
window.tickline = Object.assign(window.tickline || {}, {
  _handlers: new Map(),

  init(id, dotnet) {
    const el = document.getElementById(id);
    const onHistory = async (e) => el.prependData(await dotnet.invokeMethodAsync("RequestHistory", e.detail.before));
    el.addEventListener("tl-requesthistory", onHistory);
    this._handlers.set(id, onHistory);
  },

  setData: (id, candles) => document.getElementById(id).setData(candles),
  tick: (id, t) => document.getElementById(id).tick(t),

  position(id, time, price, side, expiry) {
    const el = document.getElementById(id);
    const color = side === "sell" ? "#f0506e" : "#22c38e";
    return [
      el.addMarker({ time, price, side, text: side === "sell" ? "Sell" : "Buy" }),
      el.addPriceLine({ price, from: time, to: expiry, color }),
      el.addTimeLine({ time: expiry, countdown: true, color }),
    ];
  },

  dispose(id) {
    const el = document.getElementById(id);
    const h = this._handlers.get(id);
    if (el && h) el.removeEventListener("tl-requesthistory", h);
    this._handlers.delete(id);
  },
});
