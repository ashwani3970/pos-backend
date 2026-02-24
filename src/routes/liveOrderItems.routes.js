const express = require("express");
const router = express.Router();
const db = require("../config/db");
const auth = require("../middlewares/auth.middleware");

router.post("/orders/live/:orderId/item", auth, async (req, res) => {
  const { item_id, size_id, qty } = req.body;
  const { orderId } = req.params;
  const restaurantId = req.user.restaurant_id;

  try {
    // 1️⃣ Validate order belongs to restaurant
    const [orderRows] = await db.query(
      "SELECT * FROM live_orders WHERE live_order_id = ? AND restaurant_id = ?",
      [orderId, restaurantId]
    );

    if (orderRows.length === 0) {
      return res.status(404).json({ message: "Order not found" });
    }

    // 2️⃣ Insert item
 const [result] = await db.query(
  `INSERT INTO live_order_items
   (live_order_id, item_id, size_id, qty, added_at, kitchen_status, is_active)
   VALUES (?, ?, ?, ?, NOW(), 'PENDING', 1)`,
  [orderId, item_id, size_id || null, qty]
);

res.json({
  id: result.insertId,
  message: "Item added successfully"
});



  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to add item" });
  }
});

router.delete("/orders/live/item/:id", auth, async (req, res) => {
  const { id } = req.params;
  const restaurantId = req.user.restaurant_id;

  try {
    const [result] = await db.query(
      `UPDATE live_order_items loi
       JOIN live_orders lo ON lo.live_order_id = loi.live_order_id
       SET loi.is_active = 0
       WHERE loi.id = ?
         AND lo.restaurant_id = ?
         AND lo.order_status = 'OPEN'
         AND (loi.kitchen_status = 'PENDING' OR loi.kitchen_status IS NULL)`,
      [id, restaurantId]
    );

    if (result.affectedRows === 0) {
      return res.status(400).json({
        message: "Item cannot be removed (already sent to kitchen)"
      });
    }

    res.json({ message: "Item removed" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to remove item" });
  }
});



module.exports = router;
