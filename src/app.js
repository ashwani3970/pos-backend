const express = require("express");
const cors = require("cors");

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

const app = express();

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

module.exports = app;
