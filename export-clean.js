const fs = require("fs");
const path = require("path");

const rootDir = __dirname;
const outputFile = path.join(rootDir, "POS_Documentation.txt");

const ignoreFolders = ["node_modules", ".git", "build", "dist"];
const allowedExtensions = [".js", ".jsx", ".ts", ".tsx", ".json", ".css", ".html"];

let output = "";

function readDirectory(dir, level = 0) {
    const files = fs.readdirSync(dir);

    files.forEach(file => {
        const fullPath = path.join(dir, file);
        const stats = fs.statSync(fullPath);

        if (stats.isDirectory()) {
            if (!ignoreFolders.includes(file)) {
                output += "\n\n" + "=".repeat(80) + "\n";
                output += "FOLDER: " + path.relative(rootDir, fullPath) + "\n";
                output += "=".repeat(80) + "\n";
                readDirectory(fullPath, level + 1);
            }
        } else {
            const ext = path.extname(file);

            if (allowedExtensions.includes(ext)) {
                output += "\n\n" + "-".repeat(80) + "\n";
                output += "FILE: " + path.relative(rootDir, fullPath) + "\n";
                output += "-".repeat(80) + "\n";

                try {
                    const content = fs.readFileSync(fullPath, "utf8");
                    output += content + "\n";
                } catch (err) {
                    output += "Error reading file\n";
                }
            }
        }
    });
}

readDirectory(rootDir);

fs.writeFileSync(outputFile, output);
console.log("✅ POS_Documentation.txt created successfully!");