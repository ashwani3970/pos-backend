const express = require("express");
const router = express.Router();
const db = require("../config/db");
const auth = require("../middlewares/auth.middleware");

/**
 * CHECK DAY STATUS
 * ✔ Accessible by ALL roles (Punch screen needs this)
 */
router.get("/day-end/status", auth, async (req, res) => {
  const restaurantId = req.user.restaurant_id;

  try {
    const [rows] = await db.query(
      `SELECT 1
       FROM day_end_lock
       WHERE restaurant_id = ?
         AND business_date = CURDATE()`,
      [restaurantId]
    );

    res.json({
      locked: rows.length > 0
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to check day status" });
  }
});

/**
 * LOCK DAY
 * ✔ MANAGER ONLY
 */
router.post("/day-end/lock", auth, async (req, res) => {
  if (req.user.role !== "MANAGER") {
    return res.status(403).json({
      message: "Access denied. Manager only."
    });
  }

  const restaurantId = req.user.restaurant_id;
  const userId = req.user.user_id;

  try {
    // 1️⃣ Check already locked
    const [lock] = await db.query(
      `SELECT 1
       FROM day_end_lock
       WHERE restaurant_id = ?
         AND business_date = CURDATE()`,
      [restaurantId]
    );

    if (lock.length > 0) {
      return res.status(400).json({
        message: "Day already locked"
      });
    }

    // 2️⃣ Check open orders
    const [openOrders] = await db.query(
      `SELECT 1
       FROM live_orders
       WHERE restaurant_id = ?`,
      [restaurantId]
    );

    if (openOrders.length > 0) {
      return res.status(400).json({
        message: "Cannot lock day. Pending orders exist."
      });
    }

    // 3️⃣ Lock day
    await db.query(
      `INSERT INTO day_end_lock
       (restaurant_id, business_date, locked_at, locked_by)
       VALUES (?, CURDATE(), NOW(), ?)`,
      [restaurantId, userId]
    );

    res.json({ message: "Day locked successfully" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Day lock failed" });
  }
});

module.exports = router;
