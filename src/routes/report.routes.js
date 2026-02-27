const express = require("express");
const router = express.Router();
const db = require("../config/db");
const auth = require("../middlewares/auth.middleware");

/**
 * DAILY SALES REPORT
 */
router.get("/reports/daily", auth, async (req, res) => {
  const restaurantId = req.user.restaurant_id;
  const { date } = req.query;

  if (!date) {
    return res.status(400).json({ message: "Date is required" });
  }

  try {
    // 1️⃣ Summary
    const [[summary]] = await db.query(
      `SELECT 
          COUNT(*) AS total_orders,
          SUM(total_amount) AS gross_sales,
          SUM(discount_amount) AS total_discount,
          SUM(net_amount) AS net_sales,
          AVG(net_amount) AS avg_bill
       FROM orders
       WHERE restaurant_id = ?
         AND DATE(closed_at) = ?`,
      [restaurantId, date]
    );

    // 2️⃣ Payment wise
        const [payments] = await db.query(
          `SELECT 
              t.tender_name,
              SUM(op.amount) AS amount
          FROM order_payments op
          JOIN payment_tenders t ON t.tender_id = op.tender_id
          JOIN orders o ON o.order_id = op.order_id
          WHERE o.restaurant_id = ?
            AND DATE(o.closed_at) = ?
          GROUP BY t.tender_name`,
          [restaurantId, date]
        );

    // 3️⃣ Item wise sales
    const [items] = await db.query(
      `SELECT 
          i.item_name,
          SUM(oi.qty) AS total_qty,
          SUM(oi.final_amount) AS total_sales
       FROM order_items oi
       JOIN items i ON i.item_id = oi.item_id
       JOIN orders o ON o.order_id = oi.order_id
       WHERE o.restaurant_id = ?
         AND DATE(o.closed_at) = ?
       GROUP BY i.item_name
       ORDER BY total_qty DESC`,
      [restaurantId, date]
    );

    res.json({
      summary,
      payments,
      items
    });

  } catch (err) {
    console.error("REPORT ERROR:", err);
    res.status(500).json({ message: "Failed to generate report" });
  }
});

module.exports = router;