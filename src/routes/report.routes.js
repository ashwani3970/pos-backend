const express = require("express");
const router = express.Router();
const db = require("../config/db");
const auth = require("../middlewares/auth.middleware");

/**
 * DAILY SALES REPORT
 */
router.get("/daily", auth, async (req, res) => {
  const restaurantId = req.user.restaurant_id;
  const { fromDate, toDate } = req.query;
    if (!fromDate || !toDate) {
      return res.status(400).json({ message: "Date range required" });
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
        AND DATE(closed_at) BETWEEN ? AND ?`,
      [restaurantId, fromDate, toDate]
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
            AND DATE(o.closed_at) BETWEEN ? AND ?
          GROUP BY t.tender_name`,
          [restaurantId, fromDate, toDate]
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
         AND DATE(o.closed_at) BETWEEN ? AND ?
       GROUP BY i.item_name
       ORDER BY total_qty DESC`,
      [restaurantId, fromDate, toDate]
    );
// 4️⃣ Category wise summary
const [categorySummary] = await db.query(
  `SELECT 
      ic.category_name,
      SUM(oi.qty) as total_qty,
      SUM(oi.final_amount) as total_sales
   FROM order_items oi
   JOIN items i ON oi.item_id = i.item_id
   JOIN item_categories ic ON i.category_id = ic.category_id
   JOIN orders o ON oi.order_id = o.order_id
   WHERE o.restaurant_id = ?
     AND DATE(o.closed_at) BETWEEN ? AND ?
   GROUP BY ic.category_name
   ORDER BY total_sales DESC`,
  [restaurantId, fromDate, toDate]
);

// 5️⃣ Category + Size summary
const [categorySizeSummary] = await db.query(
  `SELECT 
      ic.category_name,
      i.item_name,
      s.size_name,
      SUM(oi.qty) as total_qty,
      SUM(oi.final_amount) as total_sales
   FROM order_items oi
   JOIN items i ON oi.item_id = i.item_id
   JOIN item_categories ic ON i.category_id = ic.category_id
   LEFT JOIN item_sizes s ON oi.size_id = s.size_id
   JOIN orders o ON oi.order_id = o.order_id
   WHERE o.restaurant_id = ?
     AND DATE(o.closed_at) BETWEEN ? AND ?
   GROUP BY ic.category_name, i.item_name, s.size_name
   ORDER BY ic.category_name, total_sales DESC`,
  [restaurantId, fromDate, toDate]
);

    res.json({
      summary,
      payments,
      items,
      category_summary: categorySummary,
      category_size_summary: categorySizeSummary
    });


  } catch (err) {
    console.error("REPORT ERROR:", err);
    res.status(500).json({ message: "Failed to generate report" });
  }
});

router.get("/transactions", auth, async (req, res) => {

  const restaurantId = req.user.restaurant_id;
  const { fromDate, toDate } = req.query;

  if (!fromDate || !toDate) {
    return res.status(400).json({ message: "Date range required" });
  }

  try {

    const [transactions] = await db.query(
      `SELECT 
          o.order_no,
          DATE(o.closed_at) as bill_date,
          o.created_at as open_time,
          o.closed_at as close_time,
          o.order_type,
          o.customer_name,
          o.customer_mobile,
          o.total_amount,
          o.discount_amount,
          o.net_amount,
          GROUP_CONCAT(pt.tender_name) as payment_modes
       FROM orders o
       LEFT JOIN order_payments op ON o.order_id = op.order_id
       LEFT JOIN payment_tenders pt ON pt.tender_id = op.tender_id
       WHERE o.restaurant_id = ?
         AND DATE(o.closed_at) BETWEEN ? AND ?
       GROUP BY o.order_id
       ORDER BY o.closed_at DESC`,
      [restaurantId, fromDate, toDate]
    );

    res.json(transactions);

  } catch (err) {
    console.error("TRANSACTION REPORT ERROR:", err);
    res.status(500).json({ message: "Failed to generate transaction report" });
  }

});


router.get("/itemised", auth, async (req, res) => {

  const restaurantId = req.user.restaurant_id;
  const { fromDate, toDate } = req.query;

  if (!fromDate || !toDate) {
    return res.status(400).json({ message: "Date range required" });
  }

  try {

    const [items] = await db.query(
      `SELECT 
          o.order_no,
          DATE(o.closed_at) as bill_date,
          o.customer_name,
          o.order_type,
          i.item_name,
          s.size_name,
          oi.qty,
          oi.final_amount,
          o.discount_amount,
          o.net_amount
       FROM order_items oi
       JOIN orders o ON oi.order_id = o.order_id
       JOIN items i ON oi.item_id = i.item_id
       LEFT JOIN item_sizes s ON oi.size_id = s.size_id
       WHERE o.restaurant_id = ?
         AND DATE(o.closed_at) BETWEEN ? AND ?
       ORDER BY o.closed_at DESC`,
      [restaurantId, fromDate, toDate]
    );

    res.json(items);

  } catch (err) {
    console.error("ITEMISED REPORT ERROR:", err);
    res.status(500).json({ message: "Failed to generate item report" });
  }

});

module.exports = router;