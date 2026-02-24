const express = require("express");
const router = express.Router();
const db = require("../config/db");
const auth = require("../middlewares/auth.middleware");

/**
 * =========================================================
 * MANAGER FORCE CLOSE ORDER
 * Route: POST /orders/:orderId/manager-close
 * (Logic SAME as your existing close logic)
 * =========================================================
 */
router.post("/orders/:orderId/manager-close", auth, async (req, res) => {
  const { orderId } = req.params;
  const { payments = [] } = req.body;

  const restaurantId = req.user.restaurant_id;
  const userId = req.user.user_id;

  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    // 1️⃣ Fetch live order
    const [[order]] = await conn.query(
      `SELECT *
       FROM live_orders
       WHERE live_order_id = ?
         AND restaurant_id = ?
         AND order_status = 'DISPATCHED'`,
      [orderId, restaurantId]
    );

    if (!order) {
      await conn.rollback();
      return res.status(400).json({
        message: "Order not ready to close"
      });
    }

    // 2️⃣ Fetch items
    const [items] = await conn.query(
      `SELECT loi.*, s.price
       FROM live_order_items loi
       LEFT JOIN item_sizes s ON s.size_id = loi.size_id
       WHERE loi.live_order_id = ?`,
      [orderId]
    );

    // 3️⃣ Calculate subtotal
    let subTotal = 0;
    items.forEach(i => {
      subTotal += (i.price || 0) * i.qty;
    });

    // 4️⃣ Apply discount
    let discountAmount = 0;

    if (order.discount_type === "VALUE") {
      discountAmount = Number(order.discount_value || 0);
    }

    if (order.discount_type === "PERCENT") {
      discountAmount =
        (subTotal * Number(order.discount_value || 0)) / 100;
    }

    const finalAmount = subTotal - discountAmount;

    // 5️⃣ Validate payment
    const paidAmount = payments.reduce(
      (sum, p) => sum + Number(p.amount || 0),
      0
    );

    if (paidAmount !== finalAmount) {
      await conn.rollback();
      return res.status(400).json({
        message: "Payment amount does not match final bill amount"
      });
    }

    // 6️⃣ Insert into orders
    const [orderResult] = await conn.query(
      `INSERT INTO orders
       (restaurant_id, order_no, order_type, customer_name, customer_mobile,
        opened_at, closed_at, closed_by,
        subtotal_amount, discount_type, discount_value, discount_amount,
        final_amount)
       VALUES (?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?, ?, ?)`,
      [
        restaurantId,
        order.order_no,
        order.order_type,
        order.customer_name,
        order.customer_mobile,
        order.opened_at,
        userId,
        subTotal,
        order.discount_type,
        order.discount_value,
        discountAmount,
        finalAmount
      ]
    );

    const finalOrderId = orderResult.insertId;

    // 7️⃣ Insert order items
    for (const i of items) {
      await conn.query(
        `INSERT INTO order_items
         (order_id, item_id, size_id, qty, rate, amount)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          finalOrderId,
          i.item_id,
          i.size_id,
          i.qty,
          i.price || 0,
          (i.price || 0) * i.qty
        ]
      );
    }

    // 8️⃣ Insert payments
    for (const p of payments) {
      await conn.query(
        `INSERT INTO order_payments
         (order_id, tender_id, amount)
         VALUES (?, ?, ?)`,
        [finalOrderId, p.tender_id, p.amount]
      );
    }

    // 9️⃣ Timeline
    await conn.query(
      `INSERT INTO order_timeline (order_id, event, event_time)
       VALUES (?, 'CLOSED', NOW())`,
      [finalOrderId]
    );

    // 🔟 Cleanup live tables
    await conn.query(
      "DELETE FROM live_order_items WHERE live_order_id = ?",
      [orderId]
    );
    await conn.query(
      "DELETE FROM live_orders WHERE live_order_id = ?",
      [orderId]
    );

    await conn.commit();

    res.json({
      message: "Order closed successfully (Manager)",
      order_id: finalOrderId,
      final_amount: finalAmount
    });

  } catch (err) {
    await conn.rollback();
    console.error("MANAGER CLOSE ERROR:", err);
    res.status(500).json({
      message: "Order close failed"
    });
  } finally {
    conn.release();
  }
});

/**
 * =========================================================
 * MANAGER CANCEL ORDER
 * Route: POST /orders/:orderId/cancel
 * =========================================================
 */
router.post("/orders/:orderId/cancel", auth, async (req, res) => {
  if (req.user.role !== "MANAGER") {
    return res.status(403).json({
      message: "Manager authorization required"
    });
  }

  const { orderId } = req.params;
  const { reason } = req.body;

  try {
    await db.query(
      `UPDATE live_orders
       SET cancelled_at = NOW(),
           cancel_reason = ?,
           cancelled_by = ?
       WHERE live_order_id = ?`,
      [reason, req.user.user_id, orderId]
    );
    await db.query(
  "DELETE FROM live_order_items WHERE live_order_id = ?",
  [orderId]
);

await db.query(
  "DELETE FROM live_orders WHERE live_order_id = ?",
  [orderId]
);
    res.json({
      message: "Order cancelled successfully"
    });
  } catch (err) {
    console.error("CANCEL ERROR:", err);
    res.status(500).json({
      message: "Order cancel failed"
    });
  }
});

module.exports = router;
