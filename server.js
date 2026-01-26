const express = require("express");
const path = require("path");

const app = express();

// Render/Proxies
app.set("trust proxy", true);

// Recibir JSON del sensor si quieres usar este display como receptor también
app.use(express.json({ limit: "2mb" }));

// Servir HTML
app.use(express.static(path.join(__dirname, "public")));

// Health
app.get("/health", (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// -----------------------------
// MAPEO SN -> storeId (ajústalo)
// -----------------------------
const SN_TO_STORE = {
  "221000002507152508": "arrow-01",
  // "SN_OTRO": "arrow-02",
};

// Contadores en memoria (simple)
const storeCounters = {}; // { storeId: { entradas, salidas } }
function ensureStore(storeId) {
  if (!storeCounters[storeId]) storeCounters[storeId] = { entradas: 0, salidas: 0 };
}

// Endpoint para que el SENSOR mande aquí (opcional)
app.post("/api/camera/heartBeat", (req, res) => {
  return res.json({
    code: 0,
    msg: "success",
    data: { time: Math.floor(Date.now() / 1000), uploadInterval: 1, dataMode: "Add" },
  });
});

function safeNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeCounts(body) {
  const entradas = safeNumber(
    body.in ?? body.enter ?? body.Enter ?? body.In ?? body.inNum ?? body.InNum ?? 0,
    0
  );
  const salidas = safeNumber(
    body.out ?? body.leave ?? body.Leave ?? body.Out ?? body.outNum ?? body.OutNum ?? 0,
    0
  );
  return { entradas, salidas };
}

app.post("/api/camera/dataUpload", (req, res) => {
  const body = req.body || {};
  const sn = body.sn;
  const storeId = SN_TO_STORE[String(sn)];

  if (storeId) {
    ensureStore(storeId);
    const { entradas, salidas } = normalizeCounts(body);
    storeCounters[storeId].entradas += entradas;
    storeCounters[storeId].salidas += salidas;
    console.log("✅ dataUpload", { sn, storeId, entradas, salidas });
  } else {
    console.log("⚠️ dataUpload SN no mapeado:", sn);
  }

  return res.json({ code: 0, msg: "success", data: { time: Math.floor(Date.now() / 1000) } });
});

// Endpoint que usa la pantalla para mostrar datos
// Ejemplo: /api/display?sn=221000002507152508
app.get("/api/display", (req, res) => {
  const sn = String(req.query.sn || "");
  const storeId = SN_TO_STORE[sn];

  if (!sn) return res.status(400).json({ error: "Falta sn" });
  if (!storeId) return res.status(404).json({ error: "SN no mapeado", sn });

  ensureStore(storeId);
  const { entradas, salidas } = storeCounters[storeId];
  const dentro = Math.max(entradas - salidas, 0);

  res.json({ sn, storeId, entradas, salidas, dentro });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Display server activo en puerto ${PORT}`);
});
