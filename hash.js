const bcrypt = require("bcryptjs");

async function generateHash() {
  const password = "Manager@1";   // <-- change password here
  const hash = await bcrypt.hash(password, 10);
  console.log("Password Hash:\n", hash);
}

generateHash();
