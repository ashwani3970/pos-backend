const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const dbTestRoutes = require("./routes/dbTest.routes");
const authRoutes = require("./routes/auth.routes");
const configRoutes = require("./routes/config.routes");
const liveOrderRoutes = require("./routes/liveOrders.routes");
const liveOrderItemRoutes = require("./routes/liveOrderItems.routes");
const kdsRoutes = require("./routes/kds.routes");
const dispatchRoutes = require("./routes/dispatch.routes");
const cashierRoutes = require("./routes/cashier.routes");
const liveOrderComboRoutes = require("./routes/liveOrderCombos.routes");
const dayEndRoutes = require("./routes/dayEnd.routes");
const cancelRoutes = require("./routes/cancel.routes");
const discountRoutes = require("./routes/discount.routes");
const rateLimit = require("express-rate-limit");
const reportRoutes = require("./routes/report.routes");

const app = express();
app.set("trust proxy", true);
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { message: "Too many login attempts. Try again later." }
});

app.use("/api/auth/login", loginLimiter);
app.use("/api/auth/manager-login", loginLimiter);
app.use(helmet());
app.use(cors());
app.use(express.json());
app.get("/", (req, res) => {
  res.send("POS Backend Running ✅");
});


app.get("/health", (req, res) => {
  res.json({ status: "OK" });
});

app.use("/api/auth", authRoutes);
app.use("/api", configRoutes);
app.use("/api", dbTestRoutes);
app.use("/api", liveOrderRoutes);
app.use("/api", liveOrderItemRoutes);
app.use("/api", kdsRoutes);
app.use("/api", dispatchRoutes);
app.use("/api", cashierRoutes);
app.use("/api", liveOrderComboRoutes);
app.use("/api", dayEndRoutes);
app.use("/api", cancelRoutes);
app.use("/api", discountRoutes);
app.use("/", reportRoutes);

// ================= GLOBAL ERROR HANDLER =================
app.use((err, req, res, next) => {
  console.error("GLOBAL ERROR:", err);

  res.status(err.status || 500).json({
    message: err.message || "Unexpected server error"
  });
});
module.exports = app;
