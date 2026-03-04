const express = require("express");
const router = express.Router();
const db = require("../config/db");
const auth = require("../middlewares/auth.middleware");

router.post("/orders/:orderId/close", auth, async (req, res) => {
  const { orderId } = req.params;
  const { payments = [] } = req.body;

  const restaurantId = req.user.restaurant_id;
  const userId = req.user.user_id;

  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    // 1️⃣ Fetch live order (DISPATCHED)
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
      return res.status(400).json({ message: "Order not ready to close" });
    }

    // 2️⃣ Fetch items
    const [items] = await conn.query(
      `SELECT loi.*, s.price
       FROM live_order_items loi
       LEFT JOIN item_sizes s ON s.size_id = loi.size_id
       WHERE loi.live_order_id = ?`,
      [orderId]
    );

    // 3️⃣ Subtotal
    let totalAmount = 0;
    items.forEach(i => {
      totalAmount += (Number(i.price) || 0) * i.qty;
    });

    // 4️⃣ Discount FROM LIVE ORDER (SOURCE OF TRUTH)
    const discountAmount = Number(order.discount_amount || 0);
    const netAmount = Math.max(totalAmount - discountAmount, 0);

    // 5️⃣ Validate payment
    if (!payments.length) {
      await conn.rollback();
      return res.status(400).json({ message: "Payment is required" });
    }

    const paidAmount = payments.reduce(
      (sum, p) => sum + Number(p.amount || 0),
      0
    );

    if (Math.round(paidAmount) !== Math.round(netAmount)) {
      await conn.rollback();
      return res.status(400).json({
        message: "Payment amount does not match final bill amount"
      });
    }

    // 6️⃣ Insert FINAL ORDER (MATCHES DB EXACTLY)
    const [orderResult] = await conn.query(
        `INSERT INTO orders
        (
          restaurant_id,
          order_no,
          order_type,
          customer_name,
          customer_mobile,
          payment_status,
          opened_at,
          punched_at,
          dispatched_at,
          closed_at,
          closed_by,
          total_amount,
          discount_type,
          discount_value,
          discount_amount,
          discounted_by,
          net_amount
        )
        VALUES (?, ?, ?, ?, ?, 'PAID',
                ?, ?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?)`,
        [
          restaurantId,
          order.order_no,
          order.order_type,
          order.customer_name,
          order.customer_mobile,
          order.opened_at,
          order.punched_at || null,
          order.dispatched_at || null,
          userId,
          totalAmount,
          order.discount_type,
          order.discount_value,
          discountAmount,
          order.discounted_by,
          netAmount
        ]
      );

    const finalOrderId = orderResult.insertId;

    // 7️⃣ Insert order items (WITH DISCOUNT BREAKUP)
for (const i of items) {

  const price = Number(i.price) || 0;
  const qty = Number(i.qty) || 0;

  const itemTotal = price * qty;

  const itemDiscount =
    totalAmount > 0
      ? (itemTotal / totalAmount) * discountAmount
      : 0;

  const finalItemAmount = Math.max(itemTotal - itemDiscount, 0);

  await conn.query(
    `INSERT INTO order_items
     (
       order_id,
       item_id,
       combo_id,
       size_id,
       qty,
       rate,
       original_rate,
       amount,
       discount_amount,
       final_amount,
       added_at,
       kitchen_done_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      finalOrderId,
      i.item_id || null,
      i.combo_id || null,
      i.size_id || null,
      qty,
      price,
      price,
      itemTotal,
      itemDiscount,
      finalItemAmount,
      i.added_at,
      i.kitchen_done_at
    ]
  );

}


    // 9️⃣ Timeline
await conn.query(
  `INSERT INTO order_timeline
   (restaurant_id, order_id, event, event_time)
   VALUES (?, ?, 'CLOSED', NOW())`,
  [restaurantId, finalOrderId]
);

// Link timeline events to final order
await conn.query(
  `UPDATE order_timeline
   SET order_id = ?
   WHERE live_order_id = ?`,
  [finalOrderId, orderId]
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
      message: "Order closed successfully",
      order_id: finalOrderId,
      total_amount: totalAmount,
      discount_amount: discountAmount,
      net_amount: netAmount
    });

  } catch (err) {
    await conn.rollback();
    console.error("CASHIER CLOSE ERROR:", err);
    res.status(500).json({ message: "Order close failed" });
  } finally {
    conn.release();
  }
});

module.exports = router;
