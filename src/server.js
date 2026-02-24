require("dotenv").config();

if (!process.env.JWT_SECRET) {
  console.error("❌ JWT_SECRET missing in environment variables");
  process.exit(1);
}

const app = require("./app");
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`POS backend running on port ${PORT}`);
});