const express = require("express");
const router = express.Router();
const db = require("../config/db");
const auth = require("../middlewares/auth.middleware");

/**
 * GET PENDING KDS ITEMS (ITEM-LEVEL VIEW)
 * Shows all items that are still to be prepared
 */
router.get("/kds/items", auth, async (req, res) => {
  const restaurantId = req.user.restaurant_id;

  try {
    const [rows] = await db.query(
      `SELECT 
  loi.id,
  lo.live_order_id,
  lo.order_no,
  lo.order_type,
  i.item_name,
  s.size_name,
  loi.qty,
  TIMESTAMPDIFF(MINUTE, loi.added_at, NOW()) AS minutes_elapsed
FROM live_order_items loi
JOIN live_orders lo ON lo.live_order_id = loi.live_order_id
JOIN items i ON i.item_id = loi.item_id
LEFT JOIN item_sizes s ON s.size_id = loi.size_id
WHERE lo.restaurant_id = ?
AND loi.kitchen_status = 'PENDING'
  AND loi.is_active = 1
  AND lo.order_status = 'PUNCHED'
  AND lo.cancelled_at IS NULL


ORDER BY loi.added_at ASC
`,
      [restaurantId]
    );

    res.json(rows);
  } catch (err) {
    console.error("KDS ITEMS ERROR:", err);
    res.status(500).json({ message: "Failed to load KDS items" });
  }
});

/**
 * MARK A KDS ITEM AS DONE
 * If all items of an order are DONE → order becomes READY
 */
router.post("/kds/item/:itemRowId/done", auth, async (req, res) => {
  const { itemRowId } = req.params;
  const restaurantId = req.user.restaurant_id;

  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    // 1️⃣ Mark item DONE
    const [result] = await conn.query(
      `UPDATE live_order_items loi
       JOIN live_orders lo ON lo.live_order_id = loi.live_order_id
       SET loi.kitchen_status = 'DONE',
           loi.kitchen_done_at = NOW()
       WHERE loi.id = ?
         AND lo.restaurant_id = ?`,
      [itemRowId, restaurantId]
    );

    if (result.affectedRows === 0) {
      await conn.rollback();
      return res.status(404).json({ message: "Item not found or already processed" });
    }

    // 2️⃣ Find order ID
    const [[row]] = await conn.query(
      `SELECT live_order_id
       FROM live_order_items
       WHERE id = ?`,
      [itemRowId]
    );

    // 3️⃣ Check if any pending items remain
    const [[pending]] = await conn.query(
      `SELECT COUNT(*) AS cnt
       FROM live_order_items
       WHERE live_order_id = ?
         AND kitchen_status = 'PENDING'`,
      [row.live_order_id]
    );

    // 4️⃣ If all items done → mark order READY
    if (pending.cnt === 0) {
      await conn.query(
        `UPDATE live_orders
         SET order_status = 'READY'
         WHERE live_order_id = ?`,
        [row.live_order_id]
      );
    }

    await conn.commit();
    res.json({ message: "Item marked DONE" });

  } catch (err) {
    await conn.rollback();
    console.error("KDS DONE ERROR:", err);
    res.status(500).json({ message: "Failed to update KDS item" });
  } finally {
    conn.release();
  }
});

module.exports = router;
