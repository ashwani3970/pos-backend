const express = require("express");
const router = express.Router();
const db = require("../config/db");
const auth = require("../middlewares/auth.middleware");

router.post("/orders/live/:orderId/combo", auth, async (req, res) => {
  const { combo_id, qty } = req.body;
  const { orderId } = req.params;
  const restaurantId = req.user.restaurant_id;

  try {
    // 1️⃣ Validate order
    const [orders] = await db.query(
      "SELECT * FROM live_orders WHERE live_order_id = ? AND restaurant_id = ?",
      [orderId, restaurantId]
    );

    if (orders.length === 0) {
      return res.status(404).json({ message: "Order not found" });
    }

    // 2️⃣ Get combo items
    const [comboItems] = await db.query(
      `SELECT * FROM combo_items WHERE combo_id = ?`,
      [combo_id]
    );

    if (comboItems.length === 0) {
      return res.status(400).json({ message: "Invalid combo" });
    }

    // 3️⃣ Insert each item (expanded)
    for (const ci of comboItems) {
      await db.query(
        `INSERT INTO live_order_items
         (live_order_id, item_id, size_id, qty, combo_id, added_at)
         VALUES (?, ?, ?, ?, ?, NOW())`,
        [
          orderId,
          ci.item_id,
          ci.size_id,
          ci.qty * qty,
          combo_id
        ]
      );
    }

    res.json({ message: "Combo added successfully" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to add combo" });
  }
});

module.exports = router;
