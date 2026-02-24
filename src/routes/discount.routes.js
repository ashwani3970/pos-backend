const express = require("express");
const router = express.Router();
const db = require("../config/db");
const auth = require("../middlewares/auth.middleware");

/**
 * APPLY DISCOUNT ON LIVE ORDER (MANAGER ONLY)
 */
router.post("/orders/:orderId/discount", auth, async (req, res) => {
  const { orderId } = req.params;
  const { type, value } = req.body;

  if (req.user.role !== "MANAGER") {
    return res.status(403).json({
      message: "Manager authorization required"
    });
  }

  if (!["VALUE", "PERCENT"].includes(type)) {
    return res.status(400).json({
      message: "Invalid discount type"
    });
  }

  const discountValue = Number(value);
  if (discountValue <= 0) {
    return res.status(400).json({
      message: "Invalid discount value"
    });
  }

  const restaurantId = req.user.restaurant_id;
  const managerId = req.user.user_id;

  try {
    // 🔍 Fetch order
    const [[order]] = await db.query(
      `SELECT order_status
       FROM live_orders
       WHERE live_order_id = ?
         AND restaurant_id = ?
         AND cancelled_at IS NULL`,
      [orderId, restaurantId]
    );

    if (!order) {
      return res.status(404).json({
        message: "Order not found"
      });
    }

    if (order.order_status === "CLOSED") {
      return res.status(400).json({
        message: "Cannot discount closed order"
      });
    }

    // 🧮 Calculate subtotal
    const [[{ subtotal }]] = await db.query(
      `SELECT SUM(COALESCE(s.price, 0) * loi.qty) AS subtotal
       FROM live_order_items loi
       LEFT JOIN item_sizes s ON s.size_id = loi.size_id
       WHERE loi.live_order_id = ?`,
      [orderId]
    );

    if (!subtotal || subtotal <= 0) {
      return res.status(400).json({
        message: "No items in order"
      });
    }

    let discountAmount = 0;

    if (type === "VALUE") {
      if (discountValue > subtotal) {
        return res.status(400).json({
          message: "Discount exceeds order amount"
        });
      }
      discountAmount = discountValue;
    }

    if (type === "PERCENT") {
      if (discountValue > 100) {
        return res.status(400).json({
          message: "Discount percent cannot exceed 100"
        });
      }
      discountAmount = (subtotal * discountValue) / 100;
    }

    // ✅ Save discount
    await db.query(
      `UPDATE live_orders
       SET discount_type = ?,
           discount_value = ?,
           discount_amount = ?,
           discounted_by = ?
       WHERE live_order_id = ?
         AND restaurant_id = ?`,
      [type, discountValue, discountAmount, managerId, orderId, restaurantId]
    );

    res.json({
      success: true,
      subtotal,
      discount_type: type,
      discount_value: discountValue,
      discount_amount: discountAmount,
      final_amount: subtotal - discountAmount
    });

  } catch (err) {
    console.error("DISCOUNT ERROR:", err);
    res.status(500).json({
      message: "Failed to apply discount"
    });
  }
});

module.exports = router;
