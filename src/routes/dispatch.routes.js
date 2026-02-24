const express = require("express");
const router = express.Router();
const db = require("../config/db");
const auth = require("../middlewares/auth.middleware");

/**
 * GET ORDERS READY FOR DISPATCH
 */
router.get("/dispatch/orders", auth, async (req, res) => {
  const restaurantId = req.user.restaurant_id;

  try {
    const [rows] = await db.query(
      `SELECT
         live_order_id,
         order_no,
         order_type,
         opened_at
       FROM live_orders
       WHERE restaurant_id = ?
         AND order_status = 'READY'
       ORDER BY opened_at ASC`,
      [restaurantId]
    );

    res.json(rows);
  } catch (err) {
    console.error("DISPATCH LIST ERROR:", err);
    res.status(500).json({ message: "Failed to load dispatch orders" });
  }
});


/**
 * DISPATCH AN ORDER
 */
router.post("/dispatch/order/:orderId", auth, async (req, res) => {
  const { orderId } = req.params;
  const restaurantId = req.user.restaurant_id;

  try {
    const [result] = await db.query(
      `UPDATE live_orders
       SET order_status = 'DISPATCHED',
           dispatched_at = NOW()
       WHERE live_order_id = ?
         AND restaurant_id = ?
         AND order_status = 'READY'`,
      [orderId, restaurantId]
    );

    if (result.affectedRows === 0) {
      return res.status(400).json({
        message: "Order not ready for dispatch"
      });
    }

    res.json({ message: "Order dispatched" });
  } catch (err) {
    console.error("DISPATCH ERROR:", err);
    res.status(500).json({ message: "Dispatch failed" });
  }
});


/**
 * GET READY ORDERS WITH ITEMS (FOR DISPATCH SCREEN)
 * Order-wise + item details
 */
router.get("/dispatch/orders/details", auth, async (req, res) => {
  const restaurantId = req.user.restaurant_id;

  try {
    const [rows] = await db.query(
      `
      SELECT
        lo.live_order_id,
        lo.order_no,
        lo.order_type,
        lo.opened_at,  
        i.item_name,
        s.size_name,
        loi.qty
      FROM live_orders lo
      JOIN live_order_items loi ON loi.live_order_id = lo.live_order_id
      JOIN items i ON i.item_id = loi.item_id
      LEFT JOIN item_sizes s ON s.size_id = loi.size_id
      WHERE lo.restaurant_id = ?
        AND lo.order_status = 'READY'
      ORDER BY lo.order_no, loi.id
      `,
      [restaurantId]
    );

    // 🔁 Group items by order
    const ordersMap = {};

    rows.forEach(r => {
      if (!ordersMap[r.live_order_id]) {
        ordersMap[r.live_order_id] = {
  live_order_id: r.live_order_id,
  order_no: r.order_no,
  order_type: r.order_type,
  opened_at: r.opened_at,   // ✅ ADD THIS
  items: []
};

      }

      ordersMap[r.live_order_id].items.push({
        item_name: r.item_name,
        size_name: r.size_name,
        qty: r.qty
      });
    });

    res.json(Object.values(ordersMap));
  } catch (err) {
    console.error("DISPATCH DETAILS ERROR:", err);
    res.status(500).json({ message: "Failed to load dispatch order details" });
  }
});


module.exports = router;
