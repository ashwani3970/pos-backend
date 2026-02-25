const express = require("express");
const router = express.Router();
const db = require("../config/db");
const auth = require("../middlewares/auth.middleware");
const ORDER_STATUS = require("../constants/orderStatus");
/**
 * CREATE LIVE ORDER
 */
router.post("/orders/live", auth, async (req, res) => {
  const { order_type, customer_name, customer_mobile, payment_status } = req.body;
  const restaurantId = req.user.restaurant_id;
  const userId = req.user.user_id;
  // 1️⃣ Check if an empty OPEN order already exists
const [[existing]] = await db.query(
  `SELECT lo.live_order_id, lo.order_no
   FROM live_orders lo
   LEFT JOIN live_order_items li 
     ON lo.live_order_id = li.live_order_id
   WHERE lo.restaurant_id = ?
     AND lo.order_status = 'OPEN'
     AND lo.cancelled_at IS NULL
   GROUP BY lo.live_order_id
   HAVING COUNT(li.id) = 0
   ORDER BY lo.opened_at DESC
   LIMIT 1`,
  [restaurantId]
);

if (existing) {
  return res.json({
    live_order_id: existing.live_order_id,
    order_no: existing.order_no
  });
}


 try {

  const conn = await db.getConnection();
  await conn.beginTransaction();

  // 1️⃣ Check day lock
  const [lock] = await conn.query(
    "SELECT 1 FROM day_end_lock WHERE restaurant_id = ? AND business_date = CURDATE()",
    [restaurantId]
  );

  if (lock.length > 0) {
    await conn.rollback();
    conn.release();
    return res.status(403).json({ message: "Day is locked" });
  }

  // 2️⃣ LOCK sequence row
  const [[seq]] = await conn.query(
    "SELECT last_order_no FROM order_sequence WHERE restaurant_id = ? FOR UPDATE",
    [restaurantId]
  );

  if (!seq) {
    await conn.rollback();
    conn.release();
    return res.status(500).json({ message: "Order sequence not configured" });
  }

  const orderNo = seq.last_order_no + 1;

  // 3️⃣ Update sequence
  await conn.query(
    "UPDATE order_sequence SET last_order_no = ? WHERE restaurant_id = ?",
    [orderNo, restaurantId]
  );

  // 4️⃣ Insert live order
  const [result] = await conn.query(
    `INSERT INTO live_orders
     (restaurant_id, order_no, order_type, customer_name, customer_mobile,
      payment_status, order_status, opened_at, created_by)
     VALUES (?, ?, ?, ?, ?, ?, 'OPEN', NOW(), ?)`,
    [
      restaurantId,
      orderNo,
      order_type,
      customer_name,
      customer_mobile,
      payment_status,
      userId
    ]
  );

  await conn.commit();
  conn.release();

  res.json({
    live_order_id: result.insertId,
    order_no: orderNo
  });

} catch (err) {
  console.error(err);
  res.status(500).json({ message: "Order creation failed" });
}

});

/**
 * ✅ GET LIVE ORDER (ITEMS + DISCOUNT + PAYABLE)
 * 🔥 ONLY CHANGE IS HERE
 */
router.get("/orders/live/:orderId", auth, async (req, res) => {
  const { orderId } = req.params;
  const restaurantId = req.user.restaurant_id;

  try {
    // 1️⃣ Fetch items
    const [items] = await db.query(
      `SELECT 
         loi.id,
         i.item_name,
         s.size_name,
         s.price,
         loi.qty
       FROM live_order_items loi
       JOIN items i ON i.item_id = loi.item_id
       LEFT JOIN item_sizes s ON s.size_id = loi.size_id
       JOIN live_orders lo ON lo.live_order_id = loi.live_order_id
       WHERE loi.live_order_id = ?
         AND lo.restaurant_id = ?`,
      [orderId, restaurantId]
    );

    // 2️⃣ Fetch discount info from live_orders
    const [[order]] = await db.query(
      `SELECT
         discount_type,
         discount_value,
         discount_amount
       FROM live_orders
       WHERE live_order_id = ?
         AND restaurant_id = ?`,
      [orderId, restaurantId]
    );

    // 3️⃣ Calculate subtotal
    let subtotal = 0;
    items.forEach(i => {
      subtotal += (i.price || 0) * i.qty;
    });

    const discountAmount = Number(order?.discount_amount || 0);
    const finalAmount = Math.max(subtotal - discountAmount, 0);

    // 4️⃣ Send full data (used by Order Punch screen)
    res.json({
      items,
      subtotal,
      discount_type: order?.discount_type || null,
      discount_value: order?.discount_value || 0,
      discount_amount: discountAmount,
      final_amount: finalAmount
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to load order" });
  }
});

/**
 * GET DISPATCHED ORDERS (PENDING FOR CASHIER)
 */
router.get("/orders/pending", auth, async (req, res) => {
  const restaurantId = req.user.restaurant_id;

  try {
    const [rows] = await db.query(
      `SELECT 
         live_order_id,
         order_no,
         order_type,
         customer_name,
         customer_mobile,
         payment_status,
         dispatched_at
       FROM live_orders
       WHERE restaurant_id = ?
         AND order_status = 'DISPATCHED'
       ORDER BY dispatched_at ASC`,
      [restaurantId]
    );

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to load pending orders" });
  }
});

/**
 * MARK ORDER AS DISPATCHED
 */
router.post("/orders/:orderId/dispatch", auth, async (req, res) => {
  const { orderId } = req.params;
  const restaurantId = req.user.restaurant_id;

  try {
    await db.query(
      `UPDATE live_orders
       SET order_status = 'DISPATCHED',
           dispatched_at = NOW()
       WHERE live_order_id = ?
         AND restaurant_id = ?`,
      [orderId, restaurantId]
    );

    res.json({ message: "Order dispatched" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Dispatch failed" });
  }
});

/**
 * UPDATE PAYMENT STATUS (FROM PUNCH SCREEN)
 */
router.patch("/orders/live/:orderId/payment", auth, async (req, res) => {
  const { orderId } = req.params;
  const { payment_status } = req.body;
  const restaurantId = req.user.restaurant_id;

  try {
    await db.query(
      `UPDATE live_orders
       SET payment_status = ?
       WHERE live_order_id = ?
         AND restaurant_id = ?`,
      [payment_status, orderId, restaurantId]
    );

    res.json({ message: "Payment status updated" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to update payment status" });
  }
});


/**
 * SEND ORDER TO KITCHEN
 * OPEN → PUNCHED
 */
router.post("/orders/:orderId/send-to-kitchen", auth, async (req, res) => {
  const { orderId } = req.params;
  const restaurantId = req.user.restaurant_id;

  try {
    const [result] = await db.query(
      `UPDATE live_orders
       SET order_status = ?
       WHERE live_order_id = ?
         AND restaurant_id = ?
         AND order_status = ?
         AND cancelled_at IS NULL`,
      [
        ORDER_STATUS.PUNCHED,
        orderId,
        restaurantId,
        ORDER_STATUS.OPEN
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(400).json({
        message: "Order not found, already sent, or cancelled"
      });
    }

    res.json({ message: "Order sent to kitchen" });
  } catch (err) {
    console.error("SEND TO KITCHEN ERROR:", err);
    res.status(500).json({ message: "Failed to send order to kitchen" });
  }
});

router.get("/ping", auth, async (req, res) => {
  // touch DB so pool + auth are hot
  await db.query("SELECT 1");
  res.json({ ok: true });
});



module.exports = router;
